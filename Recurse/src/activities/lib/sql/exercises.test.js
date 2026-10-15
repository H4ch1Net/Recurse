// Checks the SQL lab content: structure, the seed data, and every reference solution run on a
// real SQLite (node:sqlite, in Node 22.5 and later) through the same grader the widget uses.
// Alternative correct answers must pass and common mistakes must fail.
import { describe, expect, it } from 'vitest'
import { SETS, SET_IDS, changesData, exercisesFor, setFor } from './exercises.js'
import { DATASETS, seedSql } from './datasets.js'
import { buildRun, buildSchemaRun, parseSchema } from './lab.js'
import { gradeAttempt } from './grade.js'

let DatabaseSync = null
try {
  ;({ DatabaseSync } = await import('node:sqlite'))
} catch {
  DatabaseSync = null
}

const DASHES = /[–—]/

describe('exercise sets', () => {
  it('has the six sets with 6 to 10 exercises each', () => {
    expect(SET_IDS).toEqual(['basics', 'joins', 'aggregates', 'subqueries', 'modify', 'interview'])
    for (const id of SET_IDS) {
      const n = SETS[id].exercises.length
      expect(n, id).toBeGreaterThanOrEqual(6)
      expect(n, id).toBeLessThanOrEqual(10)
    }
  })

  it('gives every exercise what the widget needs', () => {
    for (const setId of SET_IDS) {
      const ids = new Set()
      for (const ex of exercisesFor(setId)) {
        const where = `${setId}/${ex.id}`
        expect(ids.has(ex.id), `${where} duplicate id`).toBe(false)
        ids.add(ex.id)
        for (const key of ['title', 'prompt', 'solution', 'explain']) expect(typeof ex[key], `${where} ${key}`).toBe('string')
        expect(ex.hints.length, `${where} hints`).toBeGreaterThanOrEqual(2)
        expect(DATASETS[ex.dataset], `${where} dataset`).toBeTruthy()
        for (const table of ex.tables) expect(DATASETS[ex.dataset].tables, `${where} table ${table}`).toContain(table)
        expect(DASHES.test(JSON.stringify(ex)), `${where} has an en or em dash`).toBe(false)
        for (const rule of ex.mustInclude || []) expect(new RegExp(rule.pattern, 'i').test(ex.solution), `${where} mustInclude`).toBe(true)
      }
    }
    expect(DASHES.test(JSON.stringify(SETS) + JSON.stringify(DATASETS))).toBe(false)
  })

  it('picks exercises by id and falls back sensibly', () => {
    expect(setFor('nope')).toBe('basics')
    expect(exercisesFor('joins', ['anti-join', 'self-join']).map((e) => e.id)).toEqual(['self-join', 'anti-join'])
    expect(exercisesFor('joins', ['missing'])).toBe(exercisesFor('joins'))
    expect(exercisesFor('joins', ['anti-join'])).toBe(exercisesFor('joins', ['anti-join']))
    expect(exercisesFor('modify').find((e) => e.id === 'transaction').dataset).toBe('bank')
    expect(changesData(exercisesFor('modify')[0])).toBe(true)
    expect(changesData(exercisesFor('basics')[0])).toBe(false)
  })
})

// ---- A small stand-in for the worker (executeRuns in worker.js), on node:sqlite ----

/** Split SQL into statements at semicolons outside quotes and comments. */
function splitStatements(sql) {
  const out = []
  let current = ''
  let quote = null
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i]
    if (quote) {
      current += ch
      if (ch === quote) quote = null
    } else if (ch === "'" || ch === '"') {
      quote = ch
      current += ch
    } else if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++
      current += '\n'
    } else if (ch === ';') {
      out.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  out.push(current)
  return out.filter((s) => s.trim())
}

function execAll(db, sql) {
  const out = { statements: [], error: null, result: null }
  try {
    for (const text of splitStatements(sql)) {
      const stmt = db.prepare(text)
      const columns = stmt.columns().map((c) => c.name)
      if (columns.length) {
        stmt.setReturnArrays(true)
        const rows = stmt.all()
        out.result = { columns, rows, truncated: false }
        out.statements.push({ kind: 'SELECT', columns, rows, changes: 0 })
      } else {
        const { changes } = stmt.run()
        out.statements.push({ kind: text.trim().split(/\s+/)[0].toUpperCase(), changes: Number(changes) })
      }
    }
  } catch (e) {
    out.error = { message: e.message, index: out.statements.length + 1 }
  }
  return out
}

function nodeRun(run) {
  const db = new DatabaseSync(':memory:')
  const out = { mine: null, probes: [], checks: [], setupError: null }
  try {
    db.exec('PRAGMA foreign_keys = ON')
    db.exec(run.seed)
    if (run.setup) db.exec(run.setup)
    out.mine = execAll(db, run.sql)
    for (const probe of run.probes || []) {
      try {
        db.exec(probe.sql)
        out.probes.push({ label: probe.label, ok: true })
      } catch (e) {
        out.probes.push({ label: probe.label, ok: false, message: e.message })
      }
    }
    for (const check of run.checks || []) {
      const done = execAll(db, check)
      out.checks.push({ result: done.result, error: done.error?.message || null })
    }
  } catch (e) {
    out.setupError = e.message
  } finally {
    db.close()
  }
  return out
}

const find = (setId, id) => exercisesFor(setId).find((e) => e.id === id)

function attempt(exercise, sql) {
  const runs = {
    base: nodeRun(buildRun(exercise, sql, { grade: true })),
    extra: nodeRun(buildRun(exercise, sql, { extra: true, grade: true })),
    baseRef: nodeRun(buildRun(exercise, exercise.solution, { grade: true })),
    extraRef: nodeRun(buildRun(exercise, exercise.solution, { extra: true, grade: true }))
  }
  return gradeAttempt(exercise, sql, runs)
}

// Correct answers written differently from the reference.
const ACCEPT = {
  'basics/order-limit': ['SELECT price, name FROM products ORDER BY price DESC LIMIT 3'],
  'basics/like': ["select NAME, Email from customers where email like '%@GMAIL.COM'"],
  'basics/coalesce': ["SELECT name, IFNULL(city, 'Unknown') AS City FROM customers ORDER BY 1"],
  'joins/inner-join': ['SELECT orders.id AS order_id, customers.name AS customer, orders.total FROM customers INNER JOIN orders ON orders.customer_id = customers.id'],
  'joins/anti-join': [
    'SELECT name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)',
    'SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM orders)'
  ],
  'joins/left-join-filter': ["SELECT c.name, SUM(CASE WHEN o.status = 'delivered' THEN o.total ELSE 0 END) AS revenue FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.id"],
  'aggregates/having': ['SELECT name, n AS orders FROM (SELECT c.name, COUNT(*) AS n FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.id) WHERE n >= 3'],
  'subqueries/scalar': ['WITH a AS (SELECT AVG(price) AS v FROM products) SELECT name, price FROM products, a WHERE price > a.v'],
  'subqueries/beats-manager': ['SELECT e.name AS employee, e.salary, (SELECT m.salary FROM employees m WHERE m.id = e.manager_id) AS manager_salary FROM employees e WHERE e.salary > (SELECT m.salary FROM employees m WHERE m.id = e.manager_id)'],
  'interview/second-highest': [
    'SELECT DISTINCT salary AS second_highest FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1',
    'SELECT salary AS second_highest FROM (SELECT salary, DENSE_RANK() OVER (ORDER BY salary DESC) AS r FROM employees) WHERE r = 2 LIMIT 1'
  ],
  'interview/running-total': ["WITH daily AS (SELECT order_date, SUM(total) AS revenue FROM orders WHERE status != 'cancelled' GROUP BY order_date) SELECT order_date, ROUND(revenue, 2) AS revenue, ROUND(SUM(revenue) OVER (ORDER BY order_date), 2) AS running_total FROM daily ORDER BY order_date"],
  'interview/no-orders-in-march': ["SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id AND o.order_date LIKE '2026-03-%' WHERE o.id IS NULL"],
  'interview/month-over-month': ['SELECT substr(order_date, 1, 7) AS month, COUNT(*) AS orders, COUNT(*) - LAG(COUNT(*)) OVER (ORDER BY substr(order_date, 1, 7)) AS change FROM orders GROUP BY 1 ORDER BY 1'],
  'interview/both-months': ["SELECT c.name FROM customers c WHERE c.id IN (SELECT customer_id FROM orders WHERE order_date LIKE '2026-03%' INTERSECT SELECT customer_id FROM orders WHERE order_date LIKE '2026-04%')"],
  'modify/update': ['UPDATE products SET price = price * 0.9 WHERE category_id = 3'],
  'modify/update-subquery': ["UPDATE orders SET status = 'cancelled' WHERE customer_id = 2 AND status = 'pending'"],
  'modify/delete': ["DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled'); DELETE FROM orders WHERE id IN (SELECT id FROM orders WHERE status = 'cancelled');"],
  'modify/create-table': ['create table reviews (id integer primary key, product_id integer not null, rating integer not null check (rating >= 1 and rating <= 5), comment text, foreign key (product_id) references products (id))'],
  'modify/transaction': ['BEGIN TRANSACTION;\nUPDATE accounts SET balance = balance + 50 WHERE id = 2;\nUPDATE accounts SET balance = balance - 50 WHERE id = 1;\nINSERT INTO transfers (from_account, to_account, amount, created_at) VALUES (1, 2, 50, CURRENT_TIMESTAMP);\nEND TRANSACTION;']
}

// Common mistakes, with the kind of feedback they should get.
const REJECT = {
  'basics/order-limit': [['SELECT name, price FROM products ORDER BY price LIMIT 3', 'mismatch']],
  'basics/distinct': [
    ['SELECT DISTINCT city FROM customers', 'mismatch'],
    ['SELECT DISTINCT city FROM customers WHERE city <> NULL', 'mismatch']
  ],
  'basics/like': [['SELECT name, email FROM customers WHERE id IN (1, 3, 6, 8)', 'second-check']],
  'basics/is-null': [['SELECT name, email FROM customers WHERE city = NULL', 'mismatch']],
  'basics/coalesce': [["SELECT name, COALESCE(city, 'Unknown') FROM customers ORDER BY name", 'mismatch']],
  'basics/in-between': [['SELECT name, price FROM products WHERE category_id IN (1, 3) AND price BETWEEN 25 AND 40', 'order']],
  'joins/chain': [["SELECT c.name FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items oi ON oi.order_id = o.id JOIN products p ON p.id = oi.product_id WHERE p.category_id = 1", 'mismatch']],
  'joins/self-join': [['SELECT e.name AS employee, m.name AS manager FROM employees e JOIN employees m ON m.id = e.manager_id', 'mismatch']],
  'joins/anti-join': [
    ['SELECT c.name FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL', 'mismatch'],
    ["SELECT name FROM customers WHERE name IN ('Farah Haddad', 'Ivan Petrov')", 'second-check']
  ],
  'joins/left-join-filter': [["SELECT c.name, COALESCE(SUM(o.total), 0) AS revenue FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'delivered' GROUP BY c.id", 'mismatch']],
  'aggregates/count-zero': [['SELECT c.name AS category, COUNT(*) AS products FROM categories c LEFT JOIN products p ON p.category_id = c.id GROUP BY c.id', 'mismatch']],
  'aggregates/having': [['SELECT c.name, COUNT(*) AS orders FROM customers c JOIN orders o ON o.customer_id = c.id WHERE COUNT(*) >= 3 GROUP BY c.id', 'error']],
  'aggregates/count-distinct': [['SELECT p.name AS product, COUNT(o.customer_id) AS buyers FROM products p JOIN order_items oi ON oi.product_id = p.id JOIN orders o ON o.id = oi.order_id GROUP BY p.id', 'mismatch']],
  'aggregates/avg-null': [['SELECT d.name AS department, COUNT(*) AS employees, COUNT(e.salary) AS paid, ROUND(AVG(COALESCE(e.salary, 0)), 2) AS avg_salary FROM departments d JOIN employees e ON e.department_id = d.id GROUP BY d.id', 'mismatch']],
  'aggregates/category-revenue': [["SELECT c.name AS category, ROUND(SUM(oi.quantity * oi.unit_price), 2) AS revenue FROM categories c JOIN products p ON p.category_id = c.id JOIN order_items oi ON oi.product_id = p.id JOIN orders o ON o.id = oi.order_id WHERE o.status <> 'cancelled' GROUP BY c.id", 'order']],
  'subqueries/derived-table': [['SELECT ROUND(AVG(quantity), 2) AS avg_items FROM order_items', 'mismatch']],
  'interview/second-highest': [
    ['SELECT salary AS second_highest FROM employees ORDER BY salary DESC LIMIT 1 OFFSET 1', 'mismatch'],
    ['SELECT 165000 AS second_highest', 'second-check']
  ],
  'interview/top-n-rank': [['WITH r AS (SELECT d.name AS department, e.name AS employee, e.salary, ROW_NUMBER() OVER (PARTITION BY e.department_id ORDER BY e.salary DESC, e.name) AS n FROM employees e JOIN departments d ON d.id = e.department_id) SELECT department, employee, salary FROM r WHERE n <= 2', 'mismatch']],
  'interview/no-orders-in-march': [["SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.order_date LIKE '2026-03-%' AND o.id IS NULL", 'mismatch']],
  'modify/insert': [
    ["INSERT INTO products (id, name, category_id, price, stock) VALUES (14, 'Standing Desk', 2, 299, 4)", 'second-check'],
    ["INSERT INTO products (name, category_id, price) VALUES ('Standing Desk', 2, 299)", 'mismatch']
  ],
  'modify/update': [['UPDATE products SET price = ROUND(price * 0.9, 2)', 'mismatch']],
  'modify/update-subquery': [["UPDATE orders SET status = 'cancelled' WHERE id = 17", 'second-check']],
  'modify/delete': [["DELETE FROM orders WHERE status = 'cancelled'", 'error']],
  'modify/create-table': [
    ['CREATE TABLE reviews (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), rating INTEGER NOT NULL, comment TEXT)', 'probe'],
    ['CREATE TABLE reviews (id INT PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id), rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), comment TEXT)', 'mismatch'],
    ['CREATE TABLE review (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL, rating INTEGER NOT NULL, comment TEXT)', 'probe']
  ],
  'modify/junction-table': [['CREATE TABLE wishlist (customer_id INTEGER NOT NULL REFERENCES customers(id), product_id INTEGER NOT NULL REFERENCES products(id), added_on TEXT NOT NULL)', 'probe']],
  'modify/dedupe': [['DELETE FROM newsletter_signups WHERE id NOT IN (SELECT MIN(id) FROM newsletter_signups GROUP BY email)', 'mismatch']],
  'modify/transaction': [['UPDATE accounts SET balance = balance - 50 WHERE id = 1; UPDATE accounts SET balance = balance + 50 WHERE id = 2; INSERT INTO transfers (from_account, to_account, amount) VALUES (1, 2, 50);', 'missing']],
  'modify/rollback': [
    ['COMMIT;', 'mismatch'],
    ['-- nothing\n', 'empty']
  ]
}

describe.skipIf(!DatabaseSync)('reference solutions on SQLite', () => {
  it('keeps every order total equal to the sum of its items', () => {
    for (const extra of [false, true]) {
      const db = new DatabaseSync(':memory:')
      db.exec(seedSql('store', { extra }))
      const bad = db.prepare('SELECT o.id FROM orders o LEFT JOIN order_items oi ON oi.order_id = o.id GROUP BY o.id HAVING COUNT(oi.product_id) = 0 OR ABS(o.total - SUM(oi.quantity * oi.unit_price)) > 0.001').all()
      expect(bad, `extra=${extra}`).toEqual([])
      db.close()
    }
  })

  for (const setId of SET_IDS) {
    for (const exercise of exercisesFor(setId)) {
      const key = `${setId}/${exercise.id}`
      it(`${key}: the solution runs, returns rows and passes its own check`, () => {
        const base = nodeRun(buildRun(exercise, exercise.solution, { grade: true }))
        const extra = nodeRun(buildRun(exercise, exercise.solution, { extra: true, grade: true }))
        for (const run of [base, extra]) {
          expect(run.setupError, key).toBeNull()
          expect(run.mine.error, key).toBeNull()
          if (changesData(exercise)) expect(run.checks.every((c) => c.result && !c.error), key).toBe(true)
          else expect(run.mine.result.rows.length, key).toBeGreaterThan(0)
        }
        expect(attempt(exercise, exercise.solution)).toMatchObject({ pass: true })
        if (changesData(exercise)) expect(attempt(exercise, 'SELECT 1;').pass, `${key}: doing nothing must not pass`).toBe(false)
        const schema = parseSchema(exercise, nodeRun(buildSchemaRun(exercise)))
        expect(schema.map((t) => t.name)).toEqual(exercise.tables)
        for (const table of schema) expect(table.columns.length, `${key} ${table.name}`).toBeGreaterThan(0)
      })
    }
  }

  for (const [key, list] of Object.entries(ACCEPT)) {
    it(`${key}: accepts another correct answer`, () => {
      const [setId, id] = key.split('/')
      for (const sql of list) expect(attempt(find(setId, id), sql), sql).toMatchObject({ pass: true })
    })
  }

  for (const [key, list] of Object.entries(REJECT)) {
    it(`${key}: rejects common mistakes`, () => {
      const [setId, id] = key.split('/')
      for (const [sql, kind] of list) expect(attempt(find(setId, id), sql), sql).toMatchObject({ pass: false, kind })
    })
  }
})
