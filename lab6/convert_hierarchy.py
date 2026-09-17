import json
from pathlib import Path

import pandas as pd

df = pd.read_csv(f"{Path(__file__).parent.parent}/data/lab6_assignment_gdp.csv")


def build_hierarchy(dataframe, levels):

    if len(levels) == 1:

        return [
            {
                "name": row[levels[0]],
                "gdp": row["gdp_billion_usd"],
                "status": row["gdp_status"],
            }
            for _, row in dataframe.iterrows()
        ]

    current_level = levels[0]

    children = []

    for value, group in dataframe.groupby(current_level):

        children.append(
            {
                "name": value,
                "children": build_hierarchy(group, levels[1:]),
            }
        )

    return children


hierarchy = {
    "name": "World",
    "children": build_hierarchy(df, ["continent", "area", "country"]),
}

# __import__("pprint").pprint(hierarchy)

with open(
    f"{Path(__file__).parent.parent}/data/lab6_assignment_gdp.json",
    "w",
    encoding="utf-8",
) as f:
    json.dump(hierarchy, f, indent=2, ensure_ascii=False)
