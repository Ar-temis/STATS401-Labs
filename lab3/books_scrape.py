import time

import pandas as pd
import requests
from bs4 import BeautifulSoup

records = []

for page in range(1, 51):
    print("Scraping page", page)
    time.sleep(1)
    url = f"https://books.toscrape.com/catalogue/page-{page}.html"
    try:
        response = requests.get(url, timeout=10)

        response.raise_for_status()
    except requests.RequestException as e:
        print(e)
        continue

    response.encoding = "utf-8"

    soup = BeautifulSoup(response.text, "html.parser")

    books = soup.find_all("article", class_="product_pod")

    for book in books:
        title = book.select_one("h3 a")["title"]

        price = book.select_one(".price_color").get_text(strip=True)
        rating = book.select_one(".star-rating")["class"][1]
        stock = book.select_one(".availability").get_text(strip=True)

        records.append(
            {
                "title": title,
                "price": price,
                "rating": rating,
                "stock": stock,
                "page": page,
            }
        )

print("Total records:", len(records))

df = pd.DataFrame(records)

df.to_csv("../data/books.csv", index=False)
df.to_json("../data/books.json", orient="records", indent=2)
