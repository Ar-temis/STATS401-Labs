// "Three" sorts between "Two" and "Four", not after them, so map to numbers
const ratings = { One: 1, Two: 2, Three: 3, Four: 4, Five: 5 };

d3.csv("../data/books.csv")
  .then(data => {

    const columns = data.columns;

    let sortColumn = null;
    let ascending = true;

    const table = d3.select(
      "#data-table"
    );

    const header = table
      .select("thead")
      .append("tr");

    header.selectAll("th")
      .data(columns)
      .join("th")
      .style("cursor", "pointer")
      .on(
        "click",
        function(event, column) {

          // a new column starts ascending, the same column again flips it
          ascending = column === sortColumn ? !ascending : true;
          sortColumn = column;

          data.sort(
            (a, b) =>
              ascending
                ? d3.ascending(
                  value(a, column),
                  value(b, column)
                )
                : d3.descending(
                  value(a, column),
                  value(b, column)
                )
          );

          updateHeader();
          updateRows();
        }
      );

    function value(row, column) {

      const text = row[column];

      if (column === "rating") {
        return ratings[text];
      }

      // drop the currency symbol so prices sort as numbers, not as text
      const number = Number(
        text.replace(/[£,]/g, "")
      );

      return isNaN(number) ? text : number;
    }

    function updateHeader() {

      header.selectAll("th")
        .text(
          d =>
            d === sortColumn
              ? d + (ascending ? " ▲" : " ▼")
              : d
        );
    }

    function updateRows() {

      const rows = table
        .select("tbody")
        .selectAll("tr")
        .data(data);

      rows.join("tr")
        .selectAll("td")
        .data(
          row =>
            columns.map(
              column =>
                row[column]
            )
        )
        .join("td")
        .text(d => d);
    }

    updateHeader();
    updateRows();

  });
