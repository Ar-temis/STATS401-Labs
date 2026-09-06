import time

import pandas as pd
import requests
from bs4 import BeautifulSoup

records = []

# Request and process the page

for page in range(1, 10):
    print("Scraping page", page)
    time.sleep(1)
    url = "https://quotes.toscrape.com/" f"page/{page}/"
    try:
        response = requests.get(url, timeout=10)

        response.raise_for_status()
    except requests.RequestException as e:
        print(e)

    soup = BeautifulSoup(response.text, "html.parser")

    quotes = soup.find_all("div", class_="quote")

    for quote in quotes:
        text = quote.select_one("span.text").get_text(strip=True)

        author = quote.select_one(".author").get_text(strip=True)
        tags = [tag.get_text(strip=True) for tag in quote.select(".tags a")]

        records.append({"title": text, "author": author, "tags": tags})

print("Total records:", len(records))

df = pd.DataFrame(records)

df.to_csv("../data/quotes.csv", index=False)
df.to_json("../data/quotes.json", orient="records", indent=2)
