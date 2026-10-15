// Exercise sets for the SQL lab widget.
//
// Exercise fields:
//   id, title, prompt (inline markup: `code`, **bold**), dataset (defaults to the set's),
//   tables (shown in the schema view), solution (the reference query), hints (in stages),
//   explain (shown once solved or revealed), starter (optional editor text),
//   ordered: true (row order must match) or an array of column names (only those columns'
//     order matters, so rows that tie on them may come in any order),
//   setup: SQL run after the seed rows and before the learner's SQL,
//   verify: queries run after the learner's SQL ("modify" exercises compare these, not the
//     learner's own output), probes: [{ label, sql }] statements run one by one after the
//     learner's SQL that must be accepted or rejected exactly as with the solution,
//   mustInclude: [{ pattern, message }] regular expressions the SQL must contain.
// Expected rows always come from running `solution` on a fresh copy of the dataset.

export const SETS = {
  basics: {
    title: 'Basics',
    summary: 'SELECT, WHERE, ORDER BY, LIMIT, DISTINCT, LIKE and NULL',
    dataset: 'store',
    exercises: [
      {
        id: 'select-columns',
        title: 'Pick two columns',
        tables: ['products'],
        prompt: 'List every product with its `name` and `price`.',
        solution: 'SELECT name, price\nFROM products;',
        hints: [
          'SELECT lists the columns you want and FROM names the table.',
          'Separate the columns with a comma.',
          'SELECT name, price FROM ___;'
        ],
        explain: 'SELECT picks columns and FROM picks the table. With no WHERE you get every row. Naming the columns instead of writing `SELECT *` keeps the result small and keeps working when someone adds a column to the table.'
      },
      {
        id: 'where-and',
        title: 'Cheap and in stock',
        tables: ['products'],
        prompt: 'Find the products that cost less than 30 **and** are in stock (`stock` above 0). Return `name`, `price` and `stock`.',
        solution: 'SELECT name, price, stock\nFROM products\nWHERE price < 30 AND stock > 0;',
        hints: [
          'Filter rows with WHERE.',
          'Both conditions must be true, so join them with AND.',
          'WHERE price < 30 AND stock ___ 0'
        ],
        explain: 'WHERE keeps only the rows where the whole condition is true. AND needs both sides to be true; OR needs at least one.'
      },
      {
        id: 'order-limit',
        title: 'Top three by price',
        tables: ['products'],
        ordered: true,
        prompt: 'Show the three most expensive products, most expensive first. Return `name` and `price`.',
        solution: 'SELECT name, price\nFROM products\nORDER BY price DESC\nLIMIT 3;',
        hints: [
          'Sort with ORDER BY, then keep the first rows with LIMIT.',
          'ORDER BY sorts from smallest to largest unless you add DESC.',
          'ORDER BY price DESC LIMIT ___'
        ],
        explain: 'ORDER BY runs before LIMIT, so LIMIT 3 keeps the top three after sorting. Without ORDER BY the database may return rows in any order, and LIMIT alone gives you three arbitrary rows.'
      },
      {
        id: 'distinct',
        title: 'Each city once',
        tables: ['customers'],
        prompt: 'Which cities do customers live in? Return each `city` once, and leave out the customer whose city is unknown (NULL).',
        solution: 'SELECT DISTINCT city\nFROM customers\nWHERE city IS NOT NULL;',
        hints: [
          'DISTINCT right after SELECT removes duplicate rows from the result.',
          'A missing value is NULL. Test for it with IS NULL or IS NOT NULL, never with = or <>.',
          'SELECT DISTINCT city FROM customers WHERE city IS ___ NULL;'
        ],
        explain: 'DISTINCT removes duplicate rows, so Lisbon and Paris appear once each. `WHERE city <> NULL` would return nothing at all: any comparison with NULL is unknown, and WHERE only keeps rows where the condition is true.'
      },
      {
        id: 'like',
        title: 'Gmail users',
        tables: ['customers'],
        prompt: 'Marketing wants every customer with a gmail.com address. Return `name` and `email`.',
        solution: "SELECT name, email\nFROM customers\nWHERE email LIKE '%@gmail.com';",
        hints: [
          'LIKE matches a pattern: % stands for any run of characters, _ for exactly one.',
          'The address must end with @gmail.com, so put % only at the start.',
          "WHERE email LIKE '___@gmail.com'"
        ],
        explain: "The pattern '%@gmail.com' means anything, then @gmail.com at the very end. In SQLite and MySQL, LIKE ignores upper and lower case for plain letters; in PostgreSQL it does not, and ILIKE is the case-insensitive version."
      },
      {
        id: 'is-null',
        title: 'Missing city',
        tables: ['customers'],
        prompt: 'Some customers never told us their city. Find them: return `name` and `email`.',
        solution: 'SELECT name, email\nFROM customers\nWHERE city IS NULL;',
        hints: [
          'A missing value is stored as NULL.',
          '`city = NULL` is never true, not even when city is NULL.',
          'WHERE city IS ___'
        ],
        explain: 'NULL means unknown, and comparing anything with unknown gives unknown, which WHERE treats like false. IS NULL is the test that works.'
      },
      {
        id: 'in-between',
        title: 'Books and kitchen, mid-price',
        tables: ['products', 'categories'],
        ordered: true,
        prompt: 'List the products in category 1 (Books) or 3 (Kitchen) that cost between 25 and 40, both included. Return `name` and `price`, cheapest first.',
        solution: 'SELECT name, price\nFROM products\nWHERE category_id IN (1, 3)\n  AND price BETWEEN 25 AND 40\nORDER BY price;',
        hints: [
          '`category_id IN (1, 3)` is a short way to write category_id = 1 OR category_id = 3.',
          'BETWEEN 25 AND 40 includes both ends.',
          'WHERE category_id IN (1, 3) AND price BETWEEN 25 AND 40 ORDER BY ___'
        ],
        explain: 'IN and BETWEEN keep conditions readable. If you write it with OR instead, wrap the ORs in parentheses: AND binds tighter than OR, so `category_id = 1 OR category_id = 3 AND price >= 25` does not mean what it looks like.'
      },
      {
        id: 'coalesce',
        title: 'Fill in the blanks',
        tables: ['customers'],
        ordered: true,
        prompt: "List every customer's `name` and `city`, sorted by name. Where the city is missing, show the text 'Unknown' instead of NULL, still in a column called `city`.",
        solution: "SELECT name, COALESCE(city, 'Unknown') AS city\nFROM customers\nORDER BY name;",
        hints: [
          'COALESCE(a, b) returns a, unless a is NULL; then it returns b.',
          'A computed column needs a name: add AS city after it.',
          "SELECT name, COALESCE(city, 'Unknown') AS city FROM customers ORDER BY ___;"
        ],
        explain: 'COALESCE returns its first argument that is not NULL. It is the standard way to show a default for missing values, and it only changes the result, not the stored data.'
      }
    ]
  },

  joins: {
    title: 'Joins',
    summary: 'INNER, LEFT, self joins and anti-joins',
    dataset: 'store',
    exercises: [
      {
        id: 'inner-join',
        title: 'Orders with names',
        tables: ['orders', 'customers'],
        prompt: 'Show each order with the name of the customer who placed it. Return `order_id`, `customer` and `total`.',
        solution: 'SELECT o.id AS order_id, c.name AS customer, o.total\nFROM orders o\nJOIN customers c ON c.id = o.customer_id;',
        hints: [
          'orders stores customer_id; the name lives in customers. A JOIN combines the two.',
          'Match each order to its customer: `ON c.id = o.customer_id`.',
          'Rename columns with AS: `o.id AS order_id, c.name AS customer`.'
        ],
        explain: 'An INNER JOIN pairs each order with the customer whose id matches its customer_id. Table aliases (o and c) keep the query short and make it clear which id is which.'
      },
      {
        id: 'inner-drops',
        title: 'Products and categories',
        tables: ['products', 'categories'],
        prompt: 'List each product with its category name using an INNER JOIN. Return `product` and `category`. Then notice which product is missing.',
        solution: 'SELECT p.name AS product, c.name AS category\nFROM products p\nJOIN categories c ON c.id = p.category_id;',
        hints: [
          'Join products to categories on the category id.',
          'Both tables have a name column, so rename them: `p.name AS product, c.name AS category`.',
          'FROM products p JOIN categories c ON c.id = p.___'
        ],
        explain: 'An INNER JOIN keeps only rows that match on both sides. The gift card has no category (NULL), NULL never equals anything, so it silently drops out. That silent loss is the most common join bug.'
      },
      {
        id: 'left-join',
        title: 'Keep every product',
        tables: ['products', 'categories'],
        prompt: 'Same list, but keep every product, including the one with no category. Its `category` should be NULL. Return `product` and `category`.',
        solution: 'SELECT p.name AS product, c.name AS category\nFROM products p\nLEFT JOIN categories c ON c.id = p.category_id;',
        hints: [
          'LEFT JOIN keeps every row of the table written first, even when nothing matches.',
          'Put products first: `FROM products p LEFT JOIN categories c ON ...`.'
        ],
        explain: 'LEFT JOIN keeps every product and fills the category columns with NULL when nothing matches. The order matters: with categories first, you would keep the empty categories instead.'
      },
      {
        id: 'order-lines',
        title: 'What was in order 15',
        tables: ['order_items', 'products'],
        prompt: 'Show the lines of order 15: the product `name`, `quantity`, `unit_price` and `line_total` (quantity times unit price).',
        solution: 'SELECT p.name, oi.quantity, oi.unit_price,\n       oi.quantity * oi.unit_price AS line_total\nFROM order_items oi\nJOIN products p ON p.id = oi.product_id\nWHERE oi.order_id = 15;',
        hints: [
          'order_items has one row per product in an order. The product name is in products.',
          'Keep only order 15: `WHERE oi.order_id = 15`.',
          'Compute the extra column: `oi.quantity * oi.unit_price AS line_total`.'
        ],
        explain: 'order_items links orders and products: each row says how many of which product an order contains. It stores unit_price too, the price at the time of the order, because product prices change later.'
      },
      {
        id: 'chain',
        title: 'Who bought books',
        tables: ['customers', 'orders', 'order_items', 'products', 'categories'],
        prompt: "Which customers have bought something from the category named 'Books'? Count every order, whatever its status. Return each customer's `name` once.",
        solution: "SELECT DISTINCT c.name\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nJOIN order_items oi ON oi.order_id = o.id\nJOIN products p ON p.id = oi.product_id\nJOIN categories cat ON cat.id = p.category_id\nWHERE cat.name = 'Books';",
        hints: [
          'Follow the keys: customers, orders, order_items, products, categories.',
          'Each JOIN needs its own ON, for example `JOIN order_items oi ON oi.order_id = o.id`.',
          'A customer with several book lines appears several times. DISTINCT removes the repeats.'
        ],
        explain: 'Each join follows one foreign key. Joining along one-to-many links multiplies rows, so a customer with three book lines appears three times until DISTINCT collapses them. When a join gives you duplicates, ask which relationship fanned out.'
      },
      {
        id: 'self-join',
        title: 'Who is your manager',
        dataset: 'hr',
        tables: ['employees'],
        prompt: "List every employee with their manager's name. Return `employee` and `manager`. The CEO has no manager: keep her, with `manager` NULL.",
        solution: 'SELECT e.name AS employee, m.name AS manager\nFROM employees e\nLEFT JOIN employees m ON m.id = e.manager_id;',
        hints: [
          'manager_id points at another row of the same table. Use the table twice with two aliases.',
          '`FROM employees e JOIN employees m ON m.id = e.manager_id` pairs each employee with their manager.',
          'An INNER JOIN drops the CEO, whose manager_id is NULL. Use LEFT JOIN.'
        ],
        explain: 'A self join reads the same table twice under different aliases: e for the employee and m for the manager. The same pattern answers questions about any hierarchy stored in one table, such as categories with parent categories.'
      },
      {
        id: 'anti-join',
        title: 'Customers who never ordered',
        tables: ['customers', 'orders'],
        prompt: 'Using a LEFT JOIN, find the customers who have never placed an order. Return `name`.',
        solution: 'SELECT c.name\nFROM customers c\nLEFT JOIN orders o ON o.customer_id = c.id\nWHERE o.id IS NULL;',
        hints: [
          'An INNER JOIN can never show a customer without orders: there is nothing to match.',
          'LEFT JOIN keeps every customer. Where there is no order, the order columns are NULL.',
          'Keep only those rows: `WHERE o.id IS NULL`.'
        ],
        explain: 'This is an anti-join: keep the rows on the left that found no partner. Test a column that is never NULL in a real match, such as the primary key o.id. `WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)` says the same thing.'
      },
      {
        id: 'anti-join-products',
        title: 'Never sold',
        tables: ['products', 'order_items'],
        prompt: 'Which products have never appeared in any order? Return `name`.',
        solution: 'SELECT p.name\nFROM products p\nLEFT JOIN order_items oi ON oi.product_id = p.id\nWHERE oi.order_id IS NULL;',
        hints: [
          'Same shape as the last exercise: LEFT JOIN, then keep the rows with no match.',
          'Products appear in orders through order_items.product_id.',
          'LEFT JOIN order_items oi ON oi.product_id = p.id WHERE oi.order_id IS ___'
        ],
        explain: 'The anti-join works for any "never" question: products never sold, users who never logged in, courses with no students. Pick the table you want rows from as the left side.'
      },
      {
        id: 'left-join-filter',
        title: 'Revenue, including zero',
        tables: ['customers', 'orders'],
        prompt: "For every customer, show the sum of their **delivered** orders as `revenue`, and 0 for customers with none. Return `name` and `revenue`.",
        solution: "SELECT c.name, COALESCE(SUM(o.total), 0) AS revenue\nFROM customers c\nLEFT JOIN orders o\n  ON o.customer_id = c.id AND o.status = 'delivered'\nGROUP BY c.id, c.name;",
        hints: [
          'Start from customers and LEFT JOIN orders, then GROUP BY customer.',
          "Put `o.status = 'delivered'` in the ON clause. In WHERE it removes the customers whose order columns are NULL.",
          'SUM over no rows is NULL. `COALESCE(SUM(o.total), 0)` turns it into 0.'
        ],
        explain: "With a LEFT JOIN, a condition on the right table belongs in ON. In WHERE, `o.status = 'delivered'` is unknown for customers with no matching order, so they vanish and the LEFT JOIN quietly becomes an INNER JOIN. Julia is the sneaky case: she has orders, but none delivered."
      }
    ]
  },

  aggregates: {
    title: 'Aggregates',
    summary: 'COUNT, SUM, AVG, GROUP BY and HAVING',
    dataset: 'store',
    exercises: [
      {
        id: 'count-sum',
        title: 'Orders and revenue',
        tables: ['orders'],
        prompt: 'Leaving out cancelled orders, how many orders are there and what do they add up to? Return one row with `orders` and `revenue`, revenue rounded to 2 decimals.',
        solution: "SELECT COUNT(*) AS orders, ROUND(SUM(total), 2) AS revenue\nFROM orders\nWHERE status <> 'cancelled';",
        hints: [
          'COUNT(*) counts rows and SUM(total) adds up a column. With no GROUP BY you get one row for the whole table.',
          'WHERE runs before the aggregates, so it can drop cancelled orders first.',
          "ROUND(SUM(total), 2) AS revenue ... WHERE status <> ___"
        ],
        explain: 'Aggregates fold many rows into one value. WHERE filters rows before they are counted; that is why the cancelled orders never reach COUNT or SUM.'
      },
      {
        id: 'group-by',
        title: 'Orders per status',
        tables: ['orders'],
        prompt: 'How many orders are in each status? Return `status` and `orders`.',
        solution: 'SELECT status, COUNT(*) AS orders\nFROM orders\nGROUP BY status;',
        hints: [
          'GROUP BY status makes one group, and one result row, per status.',
          'Every column in SELECT must be grouped or inside an aggregate such as COUNT(*).'
        ],
        explain: 'GROUP BY splits the rows into groups and the aggregate runs once per group. SQLite lets you select a column that is neither grouped nor aggregated and picks a value from some row; PostgreSQL rejects that query, which is the safer behavior.'
      },
      {
        id: 'count-zero',
        title: 'Products per category',
        tables: ['categories', 'products'],
        prompt: 'How many products does each category have? Include categories with no products, showing 0. Return `category` and `products`.',
        solution: 'SELECT c.name AS category, COUNT(p.id) AS products\nFROM categories c\nLEFT JOIN products p ON p.category_id = c.id\nGROUP BY c.id, c.name;',
        hints: [
          'Start from categories and LEFT JOIN products, so an empty category still appears.',
          'COUNT(*) counts the joined row even when the product side is NULL, so an empty category would show 1.',
          'Count a column from the right table instead: COUNT(p.id) skips NULL.'
        ],
        explain: 'COUNT(*) counts rows; COUNT(column) counts values that are not NULL. After a LEFT JOIN an empty category still produces one row, with NULL product columns, so only COUNT(p.id) gives the honest 0.'
      },
      {
        id: 'having',
        title: 'Repeat customers',
        tables: ['customers', 'orders'],
        prompt: 'Which customers have placed at least 3 orders, of any status? Return `name` and `orders`.',
        solution: 'SELECT c.name, COUNT(*) AS orders\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nGROUP BY c.id, c.name\nHAVING COUNT(*) >= 3;',
        hints: [
          'Join customers to orders, group by customer and count.',
          'WHERE filters rows before grouping; HAVING filters groups after. A condition on COUNT(*) goes in HAVING.',
          'HAVING COUNT(*) >= ___'
        ],
        explain: 'The logical order is FROM, WHERE, GROUP BY, HAVING, SELECT, ORDER BY. COUNT does not exist yet when WHERE runs, which is why `WHERE COUNT(*) >= 3` is an error. Grouping by c.id as well as the name keeps two customers who share a name apart.'
      },
      {
        id: 'count-distinct',
        title: 'Different buyers',
        tables: ['products', 'order_items', 'orders'],
        prompt: 'For each product that has been ordered, how many **different** customers ordered it? Return `product` and `buyers`.',
        solution: 'SELECT p.name AS product, COUNT(DISTINCT o.customer_id) AS buyers\nFROM products p\nJOIN order_items oi ON oi.product_id = p.id\nJOIN orders o ON o.id = oi.order_id\nGROUP BY p.id, p.name;',
        hints: [
          'Join products to order_items, then to orders to reach customer_id.',
          'COUNT(o.customer_id) counts a customer once per order. Someone who ordered the same product twice counts twice.',
          'COUNT(DISTINCT o.customer_id) AS buyers'
        ],
        explain: 'COUNT(DISTINCT x) counts different values. Hana ordered the keyboard twice, so the keyboard has 3 order lines but 2 buyers.'
      },
      {
        id: 'avg-null',
        title: 'Average salary, honestly',
        dataset: 'hr',
        tables: ['departments', 'employees'],
        prompt: "For each department with employees, return `department`, `employees` (everyone in it), `paid` (people whose salary is set) and `avg_salary`, rounded to 2 decimals. One intern's salary is not set yet (NULL).",
        solution: 'SELECT d.name AS department,\n       COUNT(*) AS employees,\n       COUNT(e.salary) AS paid,\n       ROUND(AVG(e.salary), 2) AS avg_salary\nFROM departments d\nJOIN employees e ON e.department_id = d.id\nGROUP BY d.id, d.name;',
        hints: [
          'Join departments to employees and group by department.',
          'COUNT(*) counts people; COUNT(e.salary) counts only salaries that are not NULL.',
          'AVG skips NULL values entirely: ROUND(AVG(e.salary), 2) AS avg_salary.'
        ],
        explain: 'Finance averages 108000, not 72000: AVG divided by the 2 known salaries, not by 3 people. If a missing salary should count as zero, say so with AVG(COALESCE(salary, 0)).'
      },
      {
        id: 'having-avg',
        title: 'Well-paid departments',
        dataset: 'hr',
        tables: ['departments', 'employees'],
        prompt: 'Which departments have an average salary above 100000? Return `department` and `avg_salary`, rounded to 2 decimals.',
        solution: 'SELECT d.name AS department, ROUND(AVG(e.salary), 2) AS avg_salary\nFROM departments d\nJOIN employees e ON e.department_id = d.id\nGROUP BY d.id, d.name\nHAVING AVG(e.salary) > 100000;',
        hints: [
          'Group employees by department and take AVG(e.salary).',
          'The condition is on the average, so it belongs in HAVING.',
          'HAVING AVG(e.salary) > ___'
        ],
        explain: 'HAVING can use any aggregate, even one that is not in SELECT. Compare the unrounded average in HAVING, so rounding never decides which departments pass.'
      },
      {
        id: 'category-revenue',
        title: 'Revenue by category',
        tables: ['categories', 'products', 'order_items', 'orders'],
        ordered: true,
        prompt: 'Show revenue per category from orders that are not cancelled, highest first. Revenue is quantity times unit price, rounded to 2 decimals. Return `category` and `revenue`, only for categories with sales.',
        solution: "SELECT c.name AS category,\n       ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue\nFROM categories c\nJOIN products p ON p.category_id = c.id\nJOIN order_items oi ON oi.product_id = p.id\nJOIN orders o ON o.id = oi.order_id\nWHERE o.status <> 'cancelled'\nGROUP BY c.id, c.name\nORDER BY revenue DESC;",
        hints: [
          'Join categories, products, order_items and orders.',
          "Filter out cancelled orders in WHERE, group by category and add up quantity * unit_price.",
          'ORDER BY can use the alias from SELECT: ORDER BY revenue DESC.'
        ],
        explain: 'Revenue comes from order_items, not from products.price: line prices are what customers actually paid. A four-table join plus GROUP BY is the bread and butter of reporting queries.'
      }
    ]
  },

  subqueries: {
    title: 'Subqueries',
    summary: 'Scalar, IN, EXISTS, correlated subqueries and CTEs',
    dataset: 'store',
    exercises: [
      {
        id: 'scalar',
        title: 'Above average',
        tables: ['products'],
        prompt: 'Which products cost more than the average product price? Return `name` and `price`.',
        solution: 'SELECT name, price\nFROM products\nWHERE price > (SELECT AVG(price) FROM products);',
        hints: [
          '`WHERE price > AVG(price)` is an error: WHERE looks at one row at a time, before any aggregate exists.',
          'Compute the average in its own query and put that query in parentheses where a value goes.',
          'WHERE price > (SELECT ___ FROM products)'
        ],
        explain: 'A scalar subquery returns one value and can go anywhere a value can. The database runs it once and compares every row with the result.'
      },
      {
        id: 'in-subquery',
        title: 'Electronics buyers',
        tables: ['customers', 'orders', 'order_items', 'products'],
        prompt: 'Using IN with a subquery, list the customers who have ordered any product in category 2 (Electronics), whatever the order status. Return `name`.',
        solution: 'SELECT name\nFROM customers\nWHERE id IN (\n  SELECT o.customer_id\n  FROM orders o\n  JOIN order_items oi ON oi.order_id = o.id\n  JOIN products p ON p.id = oi.product_id\n  WHERE p.category_id = 2\n);',
        hints: [
          'Write the inner query first: the customer_id of every order that contains a product with category_id 2.',
          'Then keep the customers whose id is IN that list.',
          'WHERE id IN (SELECT o.customer_id FROM orders o JOIN order_items oi ... WHERE p.category_id = 2)'
        ],
        explain: 'IN with a subquery never repeats outer rows, unlike a join, so no DISTINCT is needed: Ana appears once even though she ordered electronics twice.'
      },
      {
        id: 'exists',
        title: 'Categories to restock',
        tables: ['categories', 'products'],
        prompt: 'Using EXISTS, list the categories that have at least one product out of stock (`stock` = 0). Return `name`.',
        solution: 'SELECT c.name\nFROM categories c\nWHERE EXISTS (\n  SELECT 1\n  FROM products p\n  WHERE p.category_id = c.id AND p.stock = 0\n);',
        hints: [
          'EXISTS (subquery) is true when the subquery returns at least one row.',
          'The subquery refers to the outer row: `WHERE p.category_id = c.id AND p.stock = 0`.',
          'SELECT c.name FROM categories c WHERE EXISTS (SELECT 1 FROM products p WHERE ___)'
        ],
        explain: 'EXISTS only cares whether a row exists, so `SELECT 1` inside is a common convention. It is a correlated subquery: it is evaluated per category, using that category\'s id.'
      },
      {
        id: 'correlated',
        title: 'Pricey for its category',
        tables: ['products'],
        prompt: 'Find the products that cost more than the average price **of their own category**. Return `name`, `category_id` and `price`.',
        solution: 'SELECT p.name, p.category_id, p.price\nFROM products p\nWHERE p.price > (\n  SELECT AVG(p2.price)\n  FROM products p2\n  WHERE p2.category_id = p.category_id\n);',
        hints: [
          'The average must be computed for the category of the product being checked, so the subquery refers to the outer row.',
          'Give the outer table one alias and the inner table another, such as p and p2.',
          'WHERE p.price > (SELECT AVG(p2.price) FROM products p2 WHERE p2.category_id = ___)'
        ],
        explain: 'A correlated subquery depends on the current outer row, so it is evaluated per row (databases often rewrite it into a join behind the scenes). The gift card has no category: its subquery averages nothing, returns NULL, and the comparison is unknown, so it is left out.'
      },
      {
        id: 'beats-manager',
        title: 'Earns more than the boss',
        dataset: 'hr',
        tables: ['employees'],
        prompt: 'Which employees earn more than their own manager? Return `employee`, `salary` and `manager_salary`.',
        solution: 'SELECT e.name AS employee, e.salary, m.salary AS manager_salary\nFROM employees e\nJOIN employees m ON m.id = e.manager_id\nWHERE e.salary > m.salary;',
        hints: [
          "You need each employee's salary next to their manager's salary.",
          'A self join does it: `JOIN employees m ON m.id = e.manager_id`. A correlated subquery works too.',
          'WHERE e.salary > ___'
        ],
        explain: 'This classic interview question has two good answers: a self join, or a correlated subquery such as `(SELECT m.salary FROM employees m WHERE m.id = e.manager_id)`. The join is easier to extend when you also want the manager\'s name.'
      },
      {
        id: 'cte',
        title: 'Big spenders',
        tables: ['customers', 'orders'],
        prompt: 'Using a CTE (WITH), find the customers whose total on orders that are not cancelled is above the average of those totals across customers who ordered. Return `name` and `spent`, rounded to 2 decimals.',
        solution: "WITH spend AS (\n  SELECT customer_id, SUM(total) AS spent\n  FROM orders\n  WHERE status <> 'cancelled'\n  GROUP BY customer_id\n)\nSELECT c.name, ROUND(s.spent, 2) AS spent\nFROM spend s\nJOIN customers c ON c.id = s.customer_id\nWHERE s.spent > (SELECT AVG(spent) FROM spend);",
        hints: [
          "Step 1 is a CTE: `WITH spend AS (SELECT customer_id, SUM(total) AS spent FROM orders WHERE status <> 'cancelled' GROUP BY customer_id)`.",
          'Step 2 uses spend like a table, joined to customers for the name.',
          'Compare with the average of the CTE itself: `WHERE s.spent > (SELECT AVG(spent) FROM spend)`.'
        ],
        explain: 'A CTE names an intermediate result so the query reads top to bottom. Here it is used twice, for the rows and for the average, which would otherwise mean writing the same subquery twice.'
      },
      {
        id: 'derived-table',
        title: 'Items per order',
        tables: ['order_items'],
        prompt: 'On average, how many items (the sum of quantities) does an order contain? Use a subquery in FROM. Return one row with `avg_items`, rounded to 2 decimals.',
        solution: 'SELECT ROUND(AVG(items), 2) AS avg_items\nFROM (\n  SELECT order_id, SUM(quantity) AS items\n  FROM order_items\n  GROUP BY order_id\n) AS per_order;',
        hints: [
          'AVG(quantity) averages order lines, not orders. You need one number per order first.',
          'Inner query: `SELECT order_id, SUM(quantity) AS items FROM order_items GROUP BY order_id`.',
          'Wrap it: SELECT ROUND(AVG(items), 2) AS avg_items FROM (inner query) AS per_order;'
        ],
        explain: 'A subquery in FROM (a derived table) lets you aggregate twice: first per order, then across orders. Averaging the lines directly answers a different question.'
      }
    ]
  },

  modify: {
    title: 'Changing data',
    summary: 'INSERT, UPDATE, DELETE, CREATE TABLE and transactions',
    dataset: 'store',
    exercises: [
      {
        id: 'insert',
        title: 'Add a product',
        tables: ['products', 'categories'],
        prompt: 'Add a new product: Standing Desk, in category 2 (Electronics), price 299, stock 4. List the columns and let the database pick the `id`.',
        solution: "INSERT INTO products (name, category_id, price, stock)\nVALUES ('Standing Desk', 2, 299, 4);",
        verify: ['SELECT id, name, category_id, price, stock FROM products ORDER BY id'],
        starter: '-- Write your statement below\n',
        hints: [
          '`INSERT INTO table (columns) VALUES (values)` adds one row.',
          'Leave id out of the column list: an INTEGER PRIMARY KEY gets the next free number.',
          "Text goes in single quotes: 'Standing Desk'."
        ],
        explain: 'Listing the columns keeps an INSERT correct even after the table gains columns, and leaving out id lets the database assign it. Single quotes are for text; double quotes are for names such as columns.'
      },
      {
        id: 'update',
        title: 'Kitchen sale',
        tables: ['products'],
        prompt: 'Kitchen sale: lower the price of every product in category 3 (Kitchen) by 10 percent, rounded to 2 decimals. No other product may change.',
        solution: 'UPDATE products\nSET price = ROUND(price * 0.9, 2)\nWHERE category_id = 3;',
        verify: ['SELECT id, name, price FROM products ORDER BY id'],
        starter: '-- Write your statement below\n',
        hints: [
          'UPDATE table SET column = new value WHERE condition.',
          'The new value can use the old one: `price * 0.9`, wrapped in ROUND(..., 2).',
          'Without WHERE, every product changes. Add WHERE category_id = 3.'
        ],
        explain: 'An UPDATE without WHERE changes every row, the classic production accident. A good habit: write the WHERE as a SELECT first, check the rows it returns, then turn it into the UPDATE.'
      },
      {
        id: 'update-subquery',
        title: 'Cancel by name',
        tables: ['customers', 'orders'],
        prompt: "Ben Okafor called to cancel all of his **pending** orders. Set their `status` to 'cancelled'. Find Ben by name with a subquery rather than typing his id.",
        solution: "UPDATE orders\nSET status = 'cancelled'\nWHERE status = 'pending'\n  AND customer_id = (SELECT id FROM customers WHERE name = 'Ben Okafor');",
        verify: ['SELECT id, customer_id, status FROM orders ORDER BY id'],
        starter: '-- Write your statement below\n',
        hints: [
          'Only his pending orders change: two conditions joined with AND.',
          "Find his id inside the statement: `(SELECT id FROM customers WHERE name = 'Ben Okafor')`.",
          "UPDATE orders SET status = 'cancelled' WHERE status = 'pending' AND customer_id = (...)"
        ],
        explain: 'A subquery in WHERE lets one statement look up what it needs. Use = only when the subquery returns one row; if two customers could be called Ben Okafor, use IN instead.'
      },
      {
        id: 'delete',
        title: 'Remove cancelled orders',
        tables: ['orders', 'order_items'],
        prompt: 'Delete every cancelled order. Foreign keys are switched on and order_items points at orders, so delete those orders\' items first. You need two statements.',
        solution: "DELETE FROM order_items\nWHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');\n\nDELETE FROM orders\nWHERE status = 'cancelled';",
        verify: ['SELECT id, status FROM orders ORDER BY id', 'SELECT order_id, product_id FROM order_items ORDER BY order_id, product_id'],
        starter: '-- Write your statements below\n',
        hints: [
          "Try `DELETE FROM orders WHERE status = 'cancelled';` on its own and read the error.",
          "Delete the child rows first: order_items `WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled')`.",
          "Then: DELETE FROM orders WHERE status = 'cancelled';"
        ],
        explain: 'A foreign key will not let order_items rows point at orders that no longer exist. Delete children before parents, or declare the key with ON DELETE CASCADE so the database does it. In real work, run both statements in one transaction so a failure halfway leaves nothing half-deleted.'
      },
      {
        id: 'create-table',
        title: 'A reviews table',
        tables: ['products'],
        prompt: 'Create a table `reviews` with four columns: `id` INTEGER PRIMARY KEY; `product_id` INTEGER, required, referencing products(id); `rating` INTEGER, required, only 1 to 5 allowed; `comment` TEXT, optional.',
        solution: 'CREATE TABLE reviews (\n  id         INTEGER PRIMARY KEY,\n  product_id INTEGER NOT NULL REFERENCES products(id),\n  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),\n  comment    TEXT\n);',
        probes: [
          { label: 'A valid review', sql: "INSERT INTO reviews (product_id, rating, comment) VALUES (1, 5, 'Great book')" },
          { label: 'A review without a comment', sql: 'INSERT INTO reviews (product_id, rating) VALUES (4, 3)' },
          { label: 'Rating 6', sql: 'INSERT INTO reviews (product_id, rating) VALUES (1, 6)' },
          { label: 'Rating 0', sql: 'INSERT INTO reviews (product_id, rating) VALUES (1, 0)' },
          { label: 'No rating', sql: "INSERT INTO reviews (product_id, comment) VALUES (1, 'Meh')" },
          { label: 'No product', sql: 'INSERT INTO reviews (rating) VALUES (4)' },
          { label: 'A product that does not exist', sql: 'INSERT INTO reviews (product_id, rating) VALUES (999, 4)' }
        ],
        verify: ['SELECT id, product_id, rating, comment FROM reviews ORDER BY id'],
        starter: 'CREATE TABLE reviews (\n  \n);\n',
        hints: [
          'Inside the parentheses, one column per line: name, type, then its constraints, separated by commas.',
          'The constraints you need: NOT NULL, `REFERENCES products(id)` and `CHECK (rating BETWEEN 1 AND 5)`.',
          'In SQLite, `id INTEGER PRIMARY KEY` gives automatic ids.'
        ],
        explain: 'Constraints make the database refuse bad data whichever app or script writes it. The check inserted seven test rows: the two valid ones went in, and NOT NULL, CHECK and the foreign key rejected the other five.'
      },
      {
        id: 'junction-table',
        title: 'A wishlist',
        tables: ['customers', 'products'],
        prompt: "Customers can save products to a wishlist. Create a table `wishlist` with `customer_id` (references customers) and `product_id` (references products), both INTEGER NOT NULL, and `added_on` TEXT NOT NULL. A product can be on a customer's list only once: make (customer_id, product_id) the primary key.",
        solution: 'CREATE TABLE wishlist (\n  customer_id INTEGER NOT NULL REFERENCES customers(id),\n  product_id  INTEGER NOT NULL REFERENCES products(id),\n  added_on    TEXT NOT NULL,\n  PRIMARY KEY (customer_id, product_id)\n);',
        probes: [
          { label: 'Ana saves the keyboard', sql: "INSERT INTO wishlist (customer_id, product_id, added_on) VALUES (1, 5, '2026-04-20')" },
          { label: 'Ana saves the mouse', sql: "INSERT INTO wishlist (customer_id, product_id, added_on) VALUES (1, 4, '2026-04-20')" },
          { label: 'Ben saves the keyboard', sql: "INSERT INTO wishlist (customer_id, product_id, added_on) VALUES (2, 5, '2026-04-21')" },
          { label: 'Ana saves the keyboard again', sql: "INSERT INTO wishlist (customer_id, product_id, added_on) VALUES (1, 5, '2026-04-22')" },
          { label: 'A customer that does not exist', sql: "INSERT INTO wishlist (customer_id, product_id, added_on) VALUES (999, 5, '2026-04-22')" },
          { label: 'A product that does not exist', sql: "INSERT INTO wishlist (customer_id, product_id, added_on) VALUES (1, 999, '2026-04-22')" },
          { label: 'No date', sql: 'INSERT INTO wishlist (customer_id, product_id) VALUES (3, 5)' }
        ],
        verify: ['SELECT customer_id, product_id, added_on FROM wishlist ORDER BY customer_id, product_id'],
        starter: 'CREATE TABLE wishlist (\n  \n);\n',
        hints: [
          'Define the three columns first, each with its type and NOT NULL.',
          'Add `REFERENCES customers(id)` and `REFERENCES products(id)` to the id columns.',
          'A table constraint goes after the columns: `PRIMARY KEY (customer_id, product_id)`.'
        ],
        explain: 'This is a junction table: it stores a many-to-many relationship (many customers, many products) as rows. The composite primary key identifies each row and blocks duplicates. SQLite, unlike most databases, allows NULL in a primary key column that is not INTEGER PRIMARY KEY, which is one more reason to write NOT NULL.'
      },
      {
        id: 'dedupe',
        title: 'Remove duplicate signups',
        tables: ['newsletter_signups'],
        prompt: 'Some people signed up for the newsletter more than once, sometimes with different capital letters. Delete the duplicates, keeping the earliest signup (lowest `id`) for each address. Compare emails without regard to case.',
        solution: 'DELETE FROM newsletter_signups\nWHERE id NOT IN (\n  SELECT MIN(id)\n  FROM newsletter_signups\n  GROUP BY LOWER(email)\n);',
        verify: ['SELECT id, email FROM newsletter_signups ORDER BY id'],
        starter: '-- Write your statement below\n',
        hints: [
          'Start with a SELECT that finds the id to keep for each address.',
          '`SELECT MIN(id) FROM newsletter_signups GROUP BY LOWER(email)` lists the keepers.',
          'Delete every row whose id is NOT IN that list.'
        ],
        explain: 'Deduplicating is a two-step idea in one statement: decide which row survives in each group, then delete the rest. Run the inner SELECT on its own first; a DELETE is only as safe as the rows you checked.'
      },
      {
        id: 'transaction',
        title: 'Transfer money safely',
        dataset: 'bank',
        tables: ['accounts', 'transfers'],
        prompt: 'Move 50 from account 1 (Ana) to account 2 (Ben) and record it in `transfers` (from_account, to_account, amount). Make the three changes one transaction: BEGIN, two UPDATEs and an INSERT, then COMMIT.',
        solution: 'BEGIN;\nUPDATE accounts SET balance = balance - 50 WHERE id = 1;\nUPDATE accounts SET balance = balance + 50 WHERE id = 2;\nINSERT INTO transfers (from_account, to_account, amount) VALUES (1, 2, 50);\nCOMMIT;',
        verify: ['SELECT id, owner, balance FROM accounts ORDER BY id', 'SELECT from_account, to_account, amount FROM transfers ORDER BY id'],
        mustInclude: [
          { pattern: '\\bBEGIN\\b', message: 'Start the transaction with BEGIN, so the three changes happen together or not at all.' },
          { pattern: '\\b(COMMIT|END)\\b', message: 'Finish with COMMIT to make all three changes permanent together.' }
        ],
        starter: 'BEGIN;\n\nCOMMIT;\n',
        hints: [
          'Subtract from one balance and add to the other: `SET balance = balance - 50 WHERE id = 1`.',
          'Record it: `INSERT INTO transfers (from_account, to_account, amount) VALUES (1, 2, 50);`',
          'Put all three between BEGIN; and COMMIT;'
        ],
        explain: 'Between BEGIN and COMMIT, either every statement takes effect or none does. If the server crashed after the first UPDATE, the database would undo it on restart instead of losing 50. The id and created_at of the new transfer are filled in by the database.'
      },
      {
        id: 'rollback',
        title: 'Undo a mistake',
        dataset: 'bank',
        tables: ['accounts'],
        setup: 'BEGIN;\nUPDATE accounts SET balance = 0;',
        prompt: 'A teammate opened a transaction and ran `UPDATE accounts SET balance = 0;` with no WHERE. Every balance now reads 0, but nothing is committed yet. Undo it.',
        solution: 'ROLLBACK;',
        verify: ['SELECT id, owner, balance FROM accounts ORDER BY id'],
        starter: '-- The transaction is still open\n',
        hints: [
          'Changes inside an open transaction are not permanent until COMMIT.',
          'One short statement throws away everything since BEGIN.'
        ],
        explain: 'ROLLBACK discards every change since BEGIN. That is why careful people run risky UPDATE and DELETE statements inside a transaction: check the result with a SELECT, then COMMIT or ROLLBACK. After COMMIT, the only way back is a backup.'
      }
    ]
  },

  interview: {
    title: 'Interview questions',
    summary: 'Classic SQL rounds: ties, duplicates, top N per group, running totals',
    dataset: 'store',
    exercises: [
      {
        id: 'second-highest',
        title: 'Second highest salary',
        dataset: 'hr',
        tables: ['employees'],
        prompt: 'Return the second highest **distinct** salary in the company as one value named `second_highest`. Careful: two people share the top salary.',
        solution: 'SELECT MAX(salary) AS second_highest\nFROM employees\nWHERE salary < (SELECT MAX(salary) FROM employees);',
        hints: [
          '`ORDER BY salary DESC LIMIT 1 OFFSET 1` returns the second row, which is the top salary again when two people share it.',
          'Look for the highest salary that is lower than the maximum.',
          'SELECT MAX(salary) AS second_highest FROM employees WHERE salary < (SELECT ___ FROM employees);'
        ],
        explain: 'Interviewers ask this to see whether you think about ties. The MAX below MAX version also returns NULL, instead of no row at all, when there is no second salary, which is what most versions of the question want. `SELECT DISTINCT salary ... LIMIT 1 OFFSET 1` and DENSE_RANK() = 2 are good answers too.'
      },
      {
        id: 'duplicates',
        title: 'Duplicate emails',
        tables: ['newsletter_signups'],
        prompt: 'Find the email addresses that signed up more than once, ignoring upper and lower case. Return `email` in lowercase and `signups`, the number of signups.',
        solution: 'SELECT LOWER(email) AS email, COUNT(*) AS signups\nFROM newsletter_signups\nGROUP BY LOWER(email)\nHAVING COUNT(*) > 1;',
        hints: [
          'Group the rows by address and count each group.',
          'Group by LOWER(email) so Ana.Silva@gmail.com and ana.silva@gmail.com land in the same group.',
          'HAVING COUNT(*) > 1 keeps only the duplicates.'
        ],
        explain: 'GROUP BY plus HAVING COUNT(*) > 1 is the standard duplicate finder. Normalizing first (LOWER, TRIM) matters in real data, where the same person types their address differently.'
      },
      {
        id: 'top-n-row-number',
        title: 'Top two per department',
        dataset: 'hr',
        tables: ['departments', 'employees'],
        prompt: "For each department, list its two highest-paid employees. When salaries tie, take names in alphabetical order, so no department shows more than two rows. Return `department`, `employee` and `salary`. Use ROW_NUMBER().",
        solution: 'WITH ranked AS (\n  SELECT d.name AS department, e.name AS employee, e.salary,\n         ROW_NUMBER() OVER (\n           PARTITION BY e.department_id\n           ORDER BY e.salary DESC, e.name\n         ) AS rn\n  FROM employees e\n  JOIN departments d ON d.id = e.department_id\n)\nSELECT department, employee, salary\nFROM ranked\nWHERE rn <= 2;',
        hints: [
          'A window function computes a value for each row while looking at related rows. ROW_NUMBER() numbers the rows within each PARTITION.',
          '`ROW_NUMBER() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC, e.name)`',
          'You cannot filter on a window function in the WHERE of the same query. Compute it in a CTE, then filter WHERE rn <= 2.'
        ],
        explain: 'Top N per group is the most common window function question. ROW_NUMBER gives every row a different number, so a tiebreaker in ORDER BY (here the name) decides who makes the cut.'
      },
      {
        id: 'top-n-rank',
        title: 'Top two, with ties',
        dataset: 'hr',
        tables: ['departments', 'employees'],
        prompt: 'Same question, but now ties share a place: if two people tie for second, both appear. Return `department`, `employee` and `salary`. Use RANK().',
        solution: 'WITH ranked AS (\n  SELECT d.name AS department, e.name AS employee, e.salary,\n         RANK() OVER (\n           PARTITION BY e.department_id\n           ORDER BY e.salary DESC\n         ) AS rnk\n  FROM employees e\n  JOIN departments d ON d.id = e.department_id\n)\nSELECT department, employee, salary\nFROM ranked\nWHERE rnk <= 2;',
        hints: [
          'Start from your ROW_NUMBER answer.',
          'RANK() gives tied rows the same number.',
          'RANK() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC) AS rnk ... WHERE rnk <= 2'
        ],
        explain: 'ROW_NUMBER numbers 1, 2, 3, 4 even through ties. RANK gives ties the same number and then skips (1, 2, 2, 4). DENSE_RANK gives ties the same number without gaps (1, 2, 2, 3). Sales shows the difference: Ines and Leo tie for second.'
      },
      {
        id: 'running-total',
        title: 'Running revenue',
        tables: ['orders'],
        ordered: true,
        prompt: 'For each day with orders that are not cancelled, show `order_date`, that day\'s `revenue` and the `running_total` of revenue up to and including that day, in date order. Round both amounts to 2 decimals.',
        solution: "SELECT order_date,\n       ROUND(SUM(total), 2) AS revenue,\n       ROUND(SUM(SUM(total)) OVER (ORDER BY order_date), 2) AS running_total\nFROM orders\nWHERE status <> 'cancelled'\nGROUP BY order_date\nORDER BY order_date;",
        hints: [
          '`SUM(x) OVER (ORDER BY order_date)` adds up x from the first row to the current one.',
          'Group by day first. Window functions run after GROUP BY, so `SUM(SUM(total)) OVER (...)` sums the daily sums.',
          'Or put the daily revenue in a CTE and run `SUM(revenue) OVER (ORDER BY order_date)` on it.'
        ],
        explain: 'A window with ORDER BY and no frame clause sums from the start up to the current row (and its ties). Grouping by day first means two orders on the same day land in one row.'
      },
      {
        id: 'no-orders-in-march',
        title: 'Quiet in March',
        tables: ['customers', 'orders'],
        prompt: 'Which customers placed no orders in March 2026? Include customers who have never ordered at all. Return `name`.',
        solution: "SELECT c.name\nFROM customers c\nWHERE NOT EXISTS (\n  SELECT 1\n  FROM orders o\n  WHERE o.customer_id = c.id\n    AND o.order_date >= '2026-03-01'\n    AND o.order_date < '2026-04-01'\n);",
        hints: [
          'This is an anti-join with a date condition on the match.',
          'With LEFT JOIN, the date condition must go in ON. In WHERE it removes the very customers you want.',
          "NOT EXISTS reads naturally: customers for whom no order exists with order_date >= '2026-03-01' AND order_date < '2026-04-01'."
        ],
        explain: "Dates stored as YYYY-MM-DD text compare correctly as strings, so the half-open range (from March 1, before April 1) picks exactly March. The half-open form also works for timestamps, where BETWEEN '2026-03-01' AND '2026-03-31' would miss anything later than midnight on the 31st."
      },
      {
        id: 'month-over-month',
        title: 'Month over month',
        tables: ['orders'],
        ordered: true,
        prompt: 'Count the orders placed each month, of any status, and the change from the month before. Return `month` (like 2026-01), `orders` and `change` (NULL for the first month), in month order.',
        solution: "WITH monthly AS (\n  SELECT strftime('%Y-%m', order_date) AS month, COUNT(*) AS orders\n  FROM orders\n  GROUP BY month\n)\nSELECT month, orders,\n       orders - LAG(orders) OVER (ORDER BY month) AS change\nFROM monthly\nORDER BY month;",
        hints: [
          "Group by month first: `strftime('%Y-%m', order_date)` or `substr(order_date, 1, 7)` turns a date into its month.",
          'LAG(x) OVER (ORDER BY month) reads x from the previous row.',
          'Compute the monthly counts in a CTE, then subtract: orders - LAG(orders) OVER (ORDER BY month) AS change.'
        ],
        explain: "LAG and LEAD read neighboring rows without a self join. The first month has no previous row, so LAG returns NULL and so does the change. In PostgreSQL you would write to_char(order_date, 'YYYY-MM') or date_trunc('month', order_date); SQLite keeps dates as text, so strftime does the job."
      },
      {
        id: 'both-months',
        title: 'Ordered in March and April',
        tables: ['customers', 'orders'],
        prompt: 'Which customers placed orders in both March 2026 and April 2026, of any status? Return `name`.',
        solution: "SELECT c.name\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nWHERE o.order_date >= '2026-03-01' AND o.order_date < '2026-05-01'\nGROUP BY c.id, c.name\nHAVING COUNT(DISTINCT substr(o.order_date, 1, 7)) = 2;",
        hints: [
          'One way: keep the March and April orders, group by customer, and require two different months.',
          'Another: the March customers INTERSECT the April customers.',
          'HAVING COUNT(DISTINCT substr(o.order_date, 1, 7)) = 2'
        ],
        explain: 'Both versions are fine in an interview. INTERSECT reads like the question; GROUP BY with HAVING COUNT(DISTINCT ...) scales to "in at least 3 of the last 6 months" without rewriting.'
      }
    ]
  }
}

export const SET_IDS = Object.keys(SETS)

/** The set for an id, falling back to basics. */
export const setFor = (id) => (SETS[id] ? id : 'basics')

// Exercises with their dataset filled in, built once so every caller gets the same objects.
const FULL = Object.fromEntries(Object.entries(SETS).map(([id, set]) => [id, set.exercises.map((exercise) => ({ dataset: set.dataset, ...exercise }))]))
const picks = new Map()

/** A set's exercises, limited to the ids in `only` when given (unknown ids are ignored). */
export function exercisesFor(setId, only) {
  const all = FULL[setFor(setId)]
  if (!Array.isArray(only) || !only.length) return all
  const key = `${setFor(setId)}|${only.join(',')}`
  if (!picks.has(key)) {
    const picked = all.filter((exercise) => only.includes(exercise.id))
    picks.set(key, picked.length ? picked : all)
  }
  return picks.get(key)
}

/** "modify" exercises are graded on the state they leave behind, not on their own output. */
export const changesData = (exercise) => Boolean(exercise.verify?.length || exercise.probes?.length)
