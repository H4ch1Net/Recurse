// Seeded databases for the SQL lab. Every exercise starts from a fresh copy: the schema, then
// the rows, then (for the second check) a few extra rows that catch queries which only work on
// this exact data, such as hard-coded ids. Expected results are never stored: the widget runs
// the reference solution on the same fresh database and compares.
//
// Keep orders.total equal to the sum of its order_items (quantity * unit_price); the tests check it.

const sqlValue = (v) => (v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`)

/** One multi-row INSERT statement. */
export function insertSql(table, columns, rows) {
  return `INSERT INTO ${table} (${columns.join(', ')}) VALUES\n${rows.map((row) => `  (${row.map(sqlValue).join(', ')})`).join(',\n')};`
}

// ---------------------------------------------------------------- store

const STORE_SCHEMA = `CREATE TABLE categories (
  id   INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE products (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  category_id INTEGER REFERENCES categories(id),
  price       REAL NOT NULL CHECK (price >= 0),
  stock       INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE customers (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  email       TEXT NOT NULL,
  city        TEXT,
  signup_date TEXT NOT NULL
);

CREATE TABLE orders (
  id          INTEGER PRIMARY KEY,
  customer_id INTEGER NOT NULL REFERENCES customers(id),
  order_date  TEXT NOT NULL,
  status      TEXT NOT NULL CHECK (status IN ('pending', 'shipped', 'delivered', 'cancelled')),
  total       REAL NOT NULL
);

CREATE TABLE order_items (
  order_id   INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  unit_price REAL NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

CREATE TABLE newsletter_signups (
  id           INTEGER PRIMARY KEY,
  email        TEXT NOT NULL,
  signed_up_on TEXT NOT NULL
);`

const STORE_DATA = [
  insertSql('categories', ['id', 'name'], [
    [1, 'Books'],
    [2, 'Electronics'],
    [3, 'Kitchen'],
    [4, 'Garden'],
    [5, 'Toys']
  ]),
  insertSql('products', ['id', 'name', 'category_id', 'price', 'stock'], [
    [1, 'The Pragmatic Programmer', 1, 39.99, 12],
    [2, 'Clean Code', 1, 34.5, 0],
    [3, 'SQL Cookbook', 1, 29.99, 7],
    [4, 'Wireless Mouse', 2, 24.99, 40],
    [5, 'Mechanical Keyboard', 2, 89.0, 15],
    [6, 'USB-C Hub', 2, 45.0, 0],
    [7, 'Noise-Cancelling Headphones', 2, 199.0, 5],
    [8, 'Chef Knife', 3, 59.9, 20],
    [9, 'Cast Iron Skillet', 3, 34.9, 9],
    [10, 'French Press', 3, 27.5, 25],
    [11, 'Garden Hose', 4, 31.0, 14],
    [12, 'Pruning Shears', 4, 18.75, 0],
    [13, 'Gift Card', null, 25.0, 100]
  ]),
  insertSql('customers', ['id', 'name', 'email', 'city', 'signup_date'], [
    [1, 'Ana Silva', 'ana.silva@gmail.com', 'Lisbon', '2026-01-04'],
    [2, 'Ben Okafor', 'ben.okafor@outlook.com', 'Lagos', '2026-01-11'],
    [3, 'Chloe Martin', 'chloe.martin@gmail.com', 'Paris', '2026-01-19'],
    [4, 'Dev Patel', 'dev@patel.dev', 'London', '2026-02-01'],
    [5, 'Elena Rossi', 'elena.rossi@proton.me', 'Rome', '2026-02-13'],
    [6, 'Farah Haddad', 'farah.haddad@gmail.com', null, '2026-02-20'],
    [7, 'Gus Novak', 'gus.novak@outlook.com', 'Prague', '2026-03-02'],
    [8, 'Hana Sato', 'hana.sato@gmail.com', 'Tokyo', '2026-03-09'],
    [9, 'Ivan Petrov', 'ivan.petrov@yandex.com', 'Lisbon', '2026-03-17'],
    [10, 'Julia Costa', 'julia.costa@outlook.com', 'Paris', '2026-03-24']
  ]),
  insertSql('orders', ['id', 'customer_id', 'order_date', 'status', 'total'], [
    [1, 1, '2026-01-06', 'delivered', 64.98],
    [2, 2, '2026-01-14', 'delivered', 89.0],
    [3, 3, '2026-01-22', 'delivered', 114.9],
    [4, 1, '2026-01-29', 'cancelled', 199.0],
    [5, 4, '2026-02-03', 'delivered', 104.48],
    [6, 5, '2026-02-15', 'delivered', 65.9],
    [7, 2, '2026-02-18', 'delivered', 49.98],
    [8, 1, '2026-03-01', 'delivered', 50.0],
    [9, 7, '2026-03-04', 'delivered', 199.0],
    [10, 3, '2026-03-08', 'cancelled', 31.0],
    [11, 8, '2026-03-11', 'delivered', 113.99],
    [12, 4, '2026-03-15', 'shipped', 59.9],
    [13, 10, '2026-03-26', 'shipped', 57.49],
    [14, 1, '2026-04-02', 'shipped', 34.9],
    [15, 5, '2026-04-05', 'pending', 99.97],
    [16, 7, '2026-04-09', 'pending', 87.0],
    [17, 2, '2026-04-12', 'pending', 34.5],
    [18, 8, '2026-04-14', 'cancelled', 89.0]
  ]),
  insertSql('order_items', ['order_id', 'product_id', 'quantity', 'unit_price'], [
    [1, 1, 1, 39.99],
    [1, 4, 1, 24.99],
    [2, 5, 1, 89.0],
    [3, 8, 1, 59.9],
    [3, 10, 2, 27.5],
    [4, 7, 1, 199.0],
    [5, 3, 1, 29.99],
    [5, 2, 1, 34.5],
    [5, 1, 1, 39.99],
    [6, 9, 1, 34.9],
    [6, 11, 1, 31.0],
    [7, 4, 2, 24.99],
    [8, 13, 2, 25.0],
    [9, 7, 1, 199.0],
    [10, 11, 1, 31.0],
    [11, 5, 1, 89.0],
    [11, 4, 1, 24.99],
    [12, 8, 1, 59.9],
    [13, 10, 1, 27.5],
    [13, 3, 1, 29.99],
    [14, 9, 1, 34.9],
    [15, 1, 1, 39.99],
    [15, 3, 2, 29.99],
    [16, 13, 1, 25.0],
    [16, 11, 2, 31.0],
    [17, 2, 1, 34.5],
    [18, 5, 1, 89.0]
  ]),
  insertSql('newsletter_signups', ['id', 'email', 'signed_up_on'], [
    [1, 'ana.silva@gmail.com', '2026-01-03'],
    [2, 'kai.mueller@web.de', '2026-01-08'],
    [3, 'Ana.Silva@gmail.com', '2026-01-15'],
    [4, 'lena.fischer@gmx.de', '2026-01-21'],
    [5, 'kai.mueller@web.de', '2026-02-02'],
    [6, 'omar.aziz@outlook.com', '2026-02-09'],
    [7, 'Kai.Mueller@web.de', '2026-02-27'],
    [8, 'zoe.lin@gmail.com', '2026-03-05']
  ])
].join('\n\n')

// Second check: a new customer with no orders and no city, an empty category, an
// out-of-stock Kitchen product nobody ordered, and orders that change most answers.
const STORE_EXTRA = [
  insertSql('categories', ['id', 'name'], [[6, 'Sports']]),
  insertSql('products', ['id', 'name', 'category_id', 'price', 'stock'], [[14, 'Bread Knife', 3, 22.0, 0]]),
  insertSql('customers', ['id', 'name', 'email', 'city', 'signup_date'], [[11, 'Kofi Mensah', 'kofi.mensah@gmail.com', null, '2026-04-01']]),
  insertSql('orders', ['id', 'customer_id', 'order_date', 'status', 'total'], [
    [19, 9, '2026-04-20', 'delivered', 37.5],
    [20, 10, '2026-04-18', 'pending', 89.0],
    [21, 2, '2026-04-22', 'pending', 24.99]
  ]),
  insertSql('order_items', ['order_id', 'product_id', 'quantity', 'unit_price'], [
    [19, 12, 2, 18.75],
    [20, 5, 1, 89.0],
    [21, 4, 1, 24.99]
  ]),
  insertSql('newsletter_signups', ['id', 'email', 'signed_up_on'], [[9, 'Zoe.Lin@gmail.com', '2026-04-02']])
].join('\n\n')

// ---------------------------------------------------------------- hr

const HR_SCHEMA = `CREATE TABLE departments (
  id       INTEGER PRIMARY KEY,
  name     TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL
);

CREATE TABLE employees (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  title         TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  manager_id    INTEGER REFERENCES employees(id),
  salary        INTEGER,
  hire_date     TEXT NOT NULL
);`

const HR_DATA = [
  insertSql('departments', ['id', 'name', 'location'], [
    [1, 'Engineering', 'Berlin'],
    [2, 'Sales', 'Madrid'],
    [3, 'Marketing', 'Madrid'],
    [4, 'Finance', 'Berlin'],
    [5, 'Legal', 'Dublin']
  ]),
  insertSql('employees', ['id', 'name', 'title', 'department_id', 'manager_id', 'salary', 'hire_date'], [
    [1, 'Maya Chen', 'CEO', null, null, 210000, '2019-03-01'],
    [2, 'Omar Haddad', 'CTO', 1, 1, 210000, '2019-03-01'],
    [3, 'Lena Fischer', 'Engineering Manager', 1, 2, 150000, '2020-06-15'],
    [4, 'Raj Iyer', 'Staff Engineer', 1, 3, 165000, '2020-09-01'],
    [5, 'Sofia Alves', 'Senior Engineer', 1, 3, 120000, '2021-04-12'],
    [6, 'Tom Becker', 'Senior Engineer', 1, 3, 120000, '2021-11-03'],
    [7, 'Nora Kim', 'Engineer', 1, 3, 95000, '2023-02-20'],
    [8, 'Carlos Ruiz', 'Head of Sales', 2, 1, 130000, '2019-08-19'],
    [9, 'Ines Moreau', 'Account Executive', 2, 8, 82000, '2022-01-10'],
    [10, 'Leo Brandt', 'Account Executive', 2, 8, 82000, '2022-05-23'],
    [11, 'Yuki Tanaka', 'Sales Associate', 2, 8, 61000, '2024-07-01'],
    [12, 'Priya Nair', 'Marketing Lead', 3, 1, 115000, '2020-02-03'],
    [13, 'Sam Okoro', 'Content Writer', 3, 12, 68000, '2023-09-11'],
    [14, 'Eva Lindqvist', 'Finance Director', 4, 1, 140000, '2019-11-25'],
    [15, 'Marco Bianchi', 'Accountant', 4, 14, 76000, '2021-03-15'],
    [16, 'Zara Ahmed', 'Finance Intern', 4, 14, null, '2026-06-01']
  ])
].join('\n\n')

const HR_EXTRA = [
  insertSql('departments', ['id', 'name', 'location'], [[6, 'Research', 'Toronto']]),
  insertSql('employees', ['id', 'name', 'title', 'department_id', 'manager_id', 'salary', 'hire_date'], [
    [17, 'Ada Brooks', 'Principal Engineer', 1, 3, 172000, '2026-05-04'],
    [18, 'Kim Ortega', 'Marketing Analyst', 3, 12, 68000, '2026-05-11']
  ])
].join('\n\n')

// ---------------------------------------------------------------- bank

const BANK_SCHEMA = `CREATE TABLE accounts (
  id      INTEGER PRIMARY KEY,
  owner   TEXT NOT NULL,
  balance REAL NOT NULL CHECK (balance >= 0)
);

CREATE TABLE transfers (
  id           INTEGER PRIMARY KEY,
  from_account INTEGER NOT NULL REFERENCES accounts(id),
  to_account   INTEGER NOT NULL REFERENCES accounts(id),
  amount       REAL NOT NULL CHECK (amount > 0),
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);`

const BANK_DATA = [
  insertSql('accounts', ['id', 'owner', 'balance'], [
    [1, 'Ana', 500.0],
    [2, 'Ben', 120.0],
    [3, 'Chloe', 75.5]
  ]),
  insertSql('transfers', ['id', 'from_account', 'to_account', 'amount', 'created_at'], [
    [1, 1, 3, 20.0, '2026-04-01 09:15:00'],
    [2, 2, 1, 35.0, '2026-04-03 17:42:00']
  ])
].join('\n\n')

const BANK_EXTRA = [
  insertSql('accounts', ['id', 'owner', 'balance'], [[4, 'Dina', 310.0]]),
  insertSql('transfers', ['id', 'from_account', 'to_account', 'amount', 'created_at'], [[3, 4, 2, 15.0, '2026-04-05 08:00:00']])
].join('\n\n')

export const DATASETS = {
  store: {
    title: 'Online store',
    tables: ['categories', 'products', 'customers', 'orders', 'order_items', 'newsletter_signups'],
    schema: STORE_SCHEMA,
    data: STORE_DATA,
    extra: STORE_EXTRA
  },
  hr: {
    title: 'Company staff',
    tables: ['departments', 'employees'],
    schema: HR_SCHEMA,
    data: HR_DATA,
    extra: HR_EXTRA
  },
  bank: {
    title: 'Bank accounts',
    tables: ['accounts', 'transfers'],
    schema: BANK_SCHEMA,
    data: BANK_DATA,
    extra: BANK_EXTRA
  }
}

/** The SQL that builds a dataset: schema and rows, plus the extra rows for the second check. */
export function seedSql(datasetId, { extra = false } = {}) {
  const ds = DATASETS[datasetId]
  if (!ds) throw new Error(`Unknown SQL lab dataset: ${datasetId}`)
  return extra ? `${ds.schema}\n\n${ds.data}\n\n${ds.extra}` : `${ds.schema}\n\n${ds.data}`
}
