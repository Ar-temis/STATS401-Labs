import numpy as np
import pandas as pd
import umap
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
from sklearn.feature_extraction.text import CountVectorizer, TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

RANDOM_SEED = 401
N_CLUSTERS = 12
N_NEIGHBORS = 5
MIN_WORDS = 10

EXTRA_STOP_WORDS = [
    "dku",
    "duke",
    "kunshan",
    "university",
    "students",
    "student",
    "course",
    "courses",
    "credit",
    "credits",
]
TOKEN_PATTERN = r"(?u)\b[a-zA-Z][a-zA-Z]+\b"

# labels were assigned after reading the passages and TF-IDF terms printed below
CLUSTER_NAMES = {
    0: "History, Asia & Global Cultures",
    1: "Major Structure & Electives",
    2: "Transfer Credit, Study Away & Costs",
    3: "Language Learning",
    4: "Politics, Policy & Governance",
    5: "Arts, Media & Humanities",
    6: "Math, Physical Sciences & Computing",
    7: "Sports, Wellness & Student Support",
    8: "Environment, Economics & Health",
    9: "Academic Standing & Withdrawal",
    10: "Grading, Credit Rules & Calendar",
    11: "DKU Institution & Services",
}

pd.set_option("display.width", 200)
pd.set_option("display.max_colwidth", 120)


df = pd.read_csv("../data/bulletin_passages.csv")
raw_count = len(df)
print(f"raw passages: {raw_count}")

df = df.dropna(subset=["text"])
df = df.drop_duplicates(subset=["text"])
print(f"after dropping empty and duplicated text: {len(df)}")

df["text_clean"] = df["text"].str.replace(r"\s+", " ", regex=True).str.strip()

# leftover table-of-contents dot leaders and bare page numbers
df = df[~df["text_clean"].str.contains(r"\.{5,}", regex=True)]
df = df[~df["text_clean"].str.fullmatch(r"\d+")]

# fragments such as "Continuation of CHINESE 101A. Prerequisite(s): CHINESE 101A"
df["word_count"] = df["text_clean"].str.split().str.len()
df = df[df["word_count"] >= MIN_WORDS]
df = df.reset_index(drop=True)

for column in ["subsection", "heading"]:
    df[column] = df[column].fillna("")

print(f"after cleaning: {len(df)} passages")


print("\npassage length (words)")
print(df["word_count"].describe())

print(f"\nformal chapters: {df['chapter'].nunique()}")
print(f"formal sections: {df['section'].nunique()}")
print("\npassages by section (top 15)")
print(df["section"].value_counts().head(15))

stop_words = list(
    CountVectorizer(stop_words="english").get_stop_words().union(EXTRA_STOP_WORDS)
)

counter = CountVectorizer(stop_words=stop_words, token_pattern=TOKEN_PATTERN)
term_matrix = counter.fit_transform(df["text_clean"].str.lower())
top_terms = (
    pd.DataFrame(
        {
            "term": counter.get_feature_names_out(),
            "count": np.asarray(term_matrix.sum(axis=0)).ravel(),
        }
    )
    .sort_values("count", ascending=False)
    .head(25)
)
top_terms.to_csv("../data/lab8_top_terms.csv", index=False)
print("\ntop meaningful t")
print(top_terms.head(15).to_string(index=False))


model = SentenceTransformer("all-MiniLM-L6-v2")

embeddings = model.encode(
    df["text_clean"].tolist(),
    normalize_embeddings=True,
)
print(f"\nembeddings: {embeddings.shape}")


similarity = cosine_similarity(embeddings)

scores = similarity[0].copy()
scores[0] = -1
index = np.argmax(scores)
print("\nnearest neighbor of the first p")
print(df.iloc[0]["text_clean"][:200])
print(df.iloc[index]["text_clean"][:200])
print("Similarity:", round(scores[index], 3))

neighbor_scores = similarity.copy()
np.fill_diagonal(neighbor_scores, -1)
neighbor_index = np.argsort(-neighbor_scores, axis=1)[:, :N_NEIGHBORS]

df["neighbors"] = [";".join(df["passage_id"].iloc[row]) for row in neighbor_index]
df["neighbor_scores"] = [
    ";".join(f"{neighbor_scores[i, j]:.3f}" for j in row)
    for i, row in enumerate(neighbor_index)
]


reducer = umap.UMAP(
    n_components=2,
    n_neighbors=15,
    min_dist=0.15,
    metric="cosine",
    random_state=RANDOM_SEED,
)

coords = reducer.fit_transform(embeddings)

df["x"] = coords[:, 0]
df["y"] = coords[:, 1]


kmeans = KMeans(
    n_clusters=N_CLUSTERS,
    random_state=RANDOM_SEED,
    n_init="auto",
)

df["cluster"] = kmeans.fit_predict(embeddings)
df["cluster_name"] = df["cluster"].map(CLUSTER_NAMES)

# TF-IDF over one "document" per cluster gives each cluster's characteristic terms
cluster_docs = df.groupby("cluster")["text_clean"].apply(" ".join)
tfidf = TfidfVectorizer(
    stop_words=stop_words,
    token_pattern=TOKEN_PATTERN,
    max_df=0.9,
    sublinear_tf=True,
)
tfidf_matrix = tfidf.fit_transform(cluster_docs)
vocabulary = np.array(tfidf.get_feature_names_out())

cluster_rows = []
for c in sorted(df["cluster"].unique()):
    subset = df[df["cluster"] == c]
    weights = tfidf_matrix[c].toarray().ravel()
    terms = vocabulary[np.argsort(-weights)[:10]]

    # representative passages are the ones closest to the cluster centre
    centre_similarity = embeddings[subset.index] @ kmeans.cluster_centers_[c]
    representative = subset.iloc[np.argsort(-centre_similarity)[:5]]

    print(f"\nCLUSTER {c}: {CLUSTER_NAMES[c]}  ({len(subset)} passages)")
    print("  TF-IDF terms:", ", ".join(terms))
    print("  sections:", subset["section"].value_counts().head(4).to_dict())
    for text in representative["text_clean"]:
        print("  -", text[:150])

    cluster_rows.append(
        {
            "cluster": c,
            "cluster_name": CLUSTER_NAMES[c],
            "passages": len(subset),
            "top_terms": ", ".join(terms),
            "top_sections": "; ".join(subset["section"].value_counts().head(3).index),
        }
    )

pd.DataFrame(cluster_rows).to_csv("../data/lab8_cluster_terms.csv", index=False)


df["section_typicality"] = np.nan
for section, subset in df.groupby("section"):
    if len(subset) < 3:
        continue
    centroid = embeddings[subset.index].mean(axis=0)
    centroid /= np.linalg.norm(centroid)
    df.loc[subset.index, "section_typicality"] = embeddings[subset.index] @ centroid


print("\nQ2: topics spread across sections (sections with >= 2 passages of topic)")
spread = (
    df.groupby(["cluster_name", "section"])
    .size()
    .reset_index(name="n")
    .query("n >= 2")
    .groupby("cluster_name")["section"]
    .nunique()
    .sort_values(ascending=False)
)
print(spread)

print("\nQ3: semantic diversity of sections (>= 8 passages)")
diversity = []
for section, subset in df.groupby("section"):
    if len(subset) < 8:
        continue
    shares = subset["cluster"].value_counts(normalize=True)
    diversity.append(
        {
            "section": section,
            "passages": len(subset),
            "topics": subset["cluster"].nunique(),
            "topic_entropy": float(-(shares * np.log2(shares)).sum()),
            "mean_dist_to_centroid": float(1 - subset["section_typicality"].mean()),
        }
    )
print(
    pd.DataFrame(diversity)
    .sort_values("mean_dist_to_centroid", ascending=False)
    .to_string(index=False)
)

print("\nQ4: most similar passage pairs from different s")
pairs = []
upper = np.triu(similarity, k=1)
for i, j in zip(*np.where(upper > 0.7)):
    a, b = df.iloc[i], df.iloc[j]
    if a["section"] != b["section"]:
        pairs.append(
            (upper[i, j], a["passage_id"], a["section"], b["passage_id"], b["section"])
        )
for score, pa, sa, pb, sb in sorted(pairs, reverse=True)[:25]:
    print(f"{score:.3f}  {pa} [{sa[:40]}]  <->  {pb} [{sb[:40]}]")

print("\nQ5: least typical passages in their s")
unusual = df.dropna(subset=["section_typicality"]).nsmallest(15, "section_typicality")
print(
    unusual[
        ["passage_id", "section", "cluster_name", "section_typicality", "text_clean"]
    ]
    .assign(text_clean=lambda d: d["text_clean"].str[:80])
    .to_string(index=False)
)

print("\nQ6: keyword spread across t")
for keyword in ["credit", "graduation", "registration", "academic integrity"]:
    hits = df[df["text_clean"].str.contains(rf"\b{keyword}", case=False, regex=True)]
    print(
        f"\n'{keyword}': {len(hits)} passages in {hits['cluster'].nunique()} topics, "
        f"{hits['section'].nunique()} sections"
    )
    print(hits["cluster_name"].value_counts().to_string())


df["x"] = df["x"].round(4)
df["y"] = df["y"].round(4)
df["section_typicality"] = df["section_typicality"].round(3)

df[
    [
        "passage_id",
        "chapter",
        "section",
        "subsection",
        "heading",
        "page",
        "text_clean",
        "word_count",
        "cluster",
        "cluster_name",
        "x",
        "y",
        "section_typicality",
        "neighbors",
        "neighbor_scores",
    ]
].rename(columns={"text_clean": "text"}).to_csv(
    "../data/lab8_embedding_map.csv", index=False
)


matrix_df = (
    df.groupby(["chapter", "section", "cluster", "cluster_name"])
    .size()
    .reset_index(name="count")
)

matrix_df.to_csv("../data/lab8_topic_section_matrix.csv", index=False)

print(f"\nwrote {len(df)} passages and {len(matrix_df)} matrix cells")
