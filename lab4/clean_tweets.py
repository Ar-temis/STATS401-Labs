import html
import re

import pandas as pd
import torch
from transformers import pipeline

SAMPLE_SIZE = 2000
RANDOM_SEED = 401

URL_PATTERN = r"https?://\S+|www\.\S+"

df = pd.read_csv("../data/tweets.csv")

print("=== raw data ===")
print(df.head())
print(df.shape)
print(df.info())
print("\nmissing values per column:")
print(df.isna().sum())
print("\ndevices:")
print(df["device"].value_counts().head(12))

before = len(df)

df = df.drop_duplicates(subset=["id"], keep="first")
df = df.drop_duplicates(subset=["text"], keep="first")
print(f"\ndropped {before - len(df)} duplicate rows")

for column in ["isRetweet", "isDeleted", "isFlagged"]:
    df[column] = (
        df[column].astype(str).str.strip().str.lower().map({"t": True, "f": False})
    )

before = len(df)
df = df[~df["isRetweet"]]
print(f"dropped {before - len(df)} retweets")

df["text"] = df["text"].astype("string")
df["text"] = df["text"].apply(lambda t: html.unescape(str(t)))
df["text"] = df["text"].str.replace(r"\s+", " ", regex=True).str.strip()

text_without_links = df["text"].str.replace(URL_PATTERN, "", regex=True).str.strip()

before = len(df)
df = df[text_without_links.str.len() > 0]
print(f"dropped {before - len(df)} link-only or empty tweets")

for column in ["favorites", "retweets"]:
    df[column] = pd.to_numeric(df[column], errors="coerce")
    df.loc[df[column] < 0, column] = pd.NA
    print(f"{column}: {df[column].isna().sum()} unusable values -> 0")
    df[column] = df[column].fillna(0).astype(int)

df["created_at"] = pd.to_datetime(df["date"], errors="coerce")
before = len(df)
df = df.dropna(subset=["created_at"])
print(f"dropped {before - len(df)} rows with an unparseable date")

df["date"] = df["created_at"].dt.date
df["year"] = df["created_at"].dt.year
df["month"] = df["created_at"].dt.to_period("M").astype(str)
df["hour"] = df["created_at"].dt.hour
df["weekday"] = df["created_at"].dt.day_name()

device_map = {
    "Twitter for iPhone": "iPhone",
    "Twitter for iPad": "iPhone",
    "Twitter for Android": "Android",
    "Twitter Web Client": "Web",
    "Twitter Web App": "Web",
    "TweetDeck": "Web",
}

df["device"] = df["device"].astype("string").str.strip()
df["platform"] = df["device"].map(device_map).fillna("Other")

print("\nplatforms after standardizing:")
print(df["platform"].value_counts())

MIN_TWEETS_PER_YEAR = 1000

year_counts = df["year"].value_counts()
usable_years = year_counts[year_counts >= MIN_TWEETS_PER_YEAR].index
before = len(df)
df = df[df["year"].isin(usable_years)]
print(
    f"\ndropped {before - len(df)} tweets from years with under "
    f"{MIN_TWEETS_PER_YEAR} tweets"
)

print(f"\n{len(df)} tweets left after cleaning")


df = df.sample(n=SAMPLE_SIZE, random_state=RANDOM_SEED).sort_values("created_at")
df = df.reset_index(drop=True)

print(f"\nsampled {len(df)} tweets, {df['year'].min()}-{df['year'].max()}")
print(df["year"].value_counts().sort_index())

raw = pd.read_csv("../data/tweets.csv")
raw[raw["id"].isin(df["id"])].to_csv("../data/lab4_raw_tweets.csv", index=False)

print("\n=== loading cardiffnlp/twitter-roberta-base-sentiment-latest ===")

sentiment_model = pipeline(
    "sentiment-analysis",
    model="cardiffnlp/twitter-roberta-base-sentiment-latest",
    top_k=None,
    device=0 if torch.cuda.is_available() else -1,
)


def prepare_for_roberta(text):
    text = str(text)
    text = re.sub(r"@\w+", "@user", text)
    text = re.sub(URL_PATTERN, "http", text)
    return text.strip()


df["sentiment_text"] = df["text"].fillna("").apply(prepare_for_roberta)

print(f"scoring {len(df)} tweets...")
results = sentiment_model(df["sentiment_text"].tolist(), truncation=True, batch_size=32)


def scores_to_dict(scores):
    return {item["label"].lower(): item["score"] for item in scores}


score_dicts = [scores_to_dict(scores) for scores in results]

df["sentiment_negative"] = [scores.get("negative", 0) for scores in score_dicts]
df["sentiment_neutral"] = [scores.get("neutral", 0) for scores in score_dicts]
df["sentiment_positive"] = [scores.get("positive", 0) for scores in score_dicts]

df["sentiment"] = [max(s, key=s.get).capitalize() for s in score_dicts]

df["sentiment_score"] = df["sentiment_positive"] - df["sentiment_negative"]

print("\n=== sentiment ===")
print(df["sentiment"].value_counts())
print(df[["text", "sentiment", "sentiment_score"]].head(10).to_string())

vis_df = df[
    [
        "id",
        "created_at",
        "date",
        "year",
        "month",
        "hour",
        "weekday",
        "platform",
        "device",
        "text",
        "favorites",
        "retweets",
        "sentiment_negative",
        "sentiment_neutral",
        "sentiment_positive",
        "sentiment_score",
        "sentiment",
    ]
].copy()

vis_df = vis_df.rename(columns={"id": "tweet_id", "favorites": "likes"})

print("\n= tidy data =")
print(vis_df.head())
print(vis_df.info())
print(vis_df.isna().sum())

vis_df.to_csv("../data/lab4_clean_tweets.csv", index=False)


by_year = (
    vis_df.groupby(["year", "platform", "sentiment"])
    .agg(count=("tweet_id", "size"), mean_score=("sentiment_score", "mean"))
    .reset_index()
)
by_year.to_csv("../data/lab4_sentiment_by_year.csv", index=False)

by_device = (
    vis_df.groupby("platform")
    .agg(
        tweets=("tweet_id", "size"),
        mean_score=("sentiment_score", "mean"),
        mean_likes=("likes", "mean"),
        mean_retweets=("retweets", "mean"),
    )
    .reset_index()
)
by_device.to_csv("../data/lab4_sentiment_by_device.csv", index=False)

print("\n=== mean sentiment by platform ===")
print(by_device)
