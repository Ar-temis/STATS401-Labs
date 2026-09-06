import pandas as pd
import requests

url = "https://jsonplaceholder.typicode.com/posts"

params = {"userId": 1}

response = requests.get(
    "https://jsonplaceholder.typicode.com/posts", params=params, timeout=10
)

response.raise_for_status()

data = response.json()

first_post = data[0]

print(first_post["id"])
print(first_post["title"])

records = []

for post in data:

    records.append(
        {"id": post["id"], "user_id": post["userId"], "title": post["title"]}
    )


df = pd.DataFrame(records)

df.to_csv("../data/posts.csv", index=False)

from urllib.robotparser import RobotFileParser

rp = RobotFileParser()
rp.set_url("https://example.com/robots.txt")
rp.read()

allowed = rp.can_fetch("STATS401-Class-Exercise/1.0", "https://example.com/some-page")

print("Allowed:", allowed)
