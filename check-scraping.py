from urllib.robotparser import RobotFileParser

rp = RobotFileParser()
rp.set_url("https://finance.yahoo.com/robots.txt")
rp.read()

allowed = rp.can_fetch(
    "STATS401-Class-Exercise/1.0",
    "https://finance.yahoo.com/markets/stocks/pink-sheet-stocks/?start=0&count=100",
)

print("Allowed:", allowed)
