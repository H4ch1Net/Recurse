// Source for the SQL lab worker. It downloads sql.js (SQLite compiled to WebAssembly) from the
// jsDelivr CDN on first use, then runs batches of queries, each on a fresh in-memory database.
// Running in a worker keeps the page responsive and lets the main thread stop a runaway query
// (a recursive CTE with no end) by terminating the worker.
//
// sqlWorkerMain and executeRuns are serialized with Function.prototype.toString: keep them
// self-contained and in plain syntax, like the Python worker in ../runner/pyWorkerSource.js.

export const SQLJS_VERSION = '1.14.2'
export const SQLJS_BASE_URL = `https://cdn.jsdelivr.net/npm/sql.js@${SQLJS_VERSION}/dist/`

/**
 * Run each { seed, setup, sql, probes, checks } on its own fresh database. Returns one result per
 * run: { mine: { statements, error, result, ms }, probes: [{ label, ok, message }],
 * checks: [{ result, error }], setupError }. `result` is { columns, rows, truncated } from the
 * last statement that returned columns. Rows past maxRows are cut off and marked truncated.
 */
export function executeRuns(SQL, runs, maxRows) {
  var LIMIT = maxRows || 1000

  function cell(value) {
    if (value instanceof Uint8Array) {
      var hex = ''
      for (var i = 0; i < value.length && i < 32; i++) hex += (value[i] < 16 ? '0' : '') + value[i].toString(16)
      return "x'" + hex.toUpperCase() + (value.length > 32 ? '...' : '') + "'"
    }
    return value
  }

  function keyword(text) {
    var rest = String(text || '').replace(/^(\s+|--[^\n]*(\n|$)|\/\*[\s\S]*?\*\/)+/, '')
    var match = /^[A-Za-z]+/.exec(rest)
    return match ? match[0].toUpperCase() : ''
  }

  function totalChanges(db) {
    var stmt = db.prepare('SELECT total_changes()')
    stmt.step()
    var n = stmt.get()[0]
    stmt.free()
    return n
  }

  function execAll(db, sql) {
    var out = { statements: [], error: null, result: null }
    try {
      var iterator = db.iterateStatements(sql)
      for (;;) {
        var next = iterator.next()
        if (next.done) break
        var stmt = next.value
        var before = totalChanges(db)
        var columns = stmt.getColumnNames()
        var rows = []
        var truncated = false
        while (stmt.step()) {
          if (rows.length >= LIMIT) {
            truncated = true
            break
          }
          rows.push(stmt.get().map(cell))
        }
        var text = stmt.getSQL()
        stmt.free()
        var entry = { kind: keyword(text), changes: totalChanges(db) - before }
        if (columns.length) {
          entry.columns = columns
          entry.rows = rows
          entry.truncated = truncated
          out.result = { columns: columns, rows: rows, truncated: truncated }
        }
        out.statements.push(entry)
      }
    } catch (e) {
      out.error = { message: String((e && e.message) || e), index: out.statements.length + 1 }
    }
    return out
  }

  function runOne(run) {
    var out = { mine: null, probes: [], checks: [], setupError: null }
    var db = new SQL.Database()
    try {
      db.run('PRAGMA foreign_keys = ON')
      var seed = execAll(db, run.seed || '')
      if (seed.error) {
        out.setupError = seed.error.message
        return out
      }
      if (run.setup) {
        var setup = execAll(db, run.setup)
        if (setup.error) {
          out.setupError = setup.error.message
          return out
        }
      }
      var started = Date.now()
      out.mine = execAll(db, run.sql || '')
      out.mine.ms = Date.now() - started
      var probes = run.probes || []
      for (var p = 0; p < probes.length; p++) {
        try {
          db.run(probes[p].sql)
          out.probes.push({ label: probes[p].label, ok: true })
        } catch (e) {
          out.probes.push({ label: probes[p].label, ok: false, message: String((e && e.message) || e) })
        }
      }
      var checks = run.checks || []
      for (var c = 0; c < checks.length; c++) {
        var done = execAll(db, checks[c])
        out.checks.push({ result: done.result, error: done.error ? done.error.message : null })
      }
    } finally {
      db.close()
    }
    return out
  }

  var results = []
  for (var r = 0; r < runs.length; r++) results.push(runOne(runs[r]))
  return results
}

export function sqlWorkerMain(scope, baseURL, execute) {
  var SQL = null

  function init() {
    try {
      scope.importScripts(baseURL + 'sql-wasm.js')
    } catch (e) {
      scope.postMessage({ t: 'load-error', network: true, message: String((e && e.message) || e) })
      return
    }
    scope
      .initSqlJs({
        locateFile: function (file) {
          return baseURL + file
        }
      })
      .then(function (module) {
        SQL = module
        var probe = new SQL.Database()
        var version = probe.exec('SELECT sqlite_version()')[0].values[0][0]
        probe.close()
        scope.postMessage({ t: 'ready', version: version })
      })
      .catch(function (e) {
        var message = String((e && e.message) || e)
        scope.postMessage({ t: 'load-error', network: /fetch|network|load|wasm|import/i.test(message), message: message })
      })
  }

  scope.onmessage = function (event) {
    var message = event.data || {}
    if (message.t === 'init') init()
    else if (message.t === 'run' && SQL) {
      var results = null
      var error = null
      try {
        results = execute(SQL, message.runs || [], message.maxRows)
      } catch (e) {
        error = String((e && e.message) || e)
      }
      scope.postMessage({ t: 'done', job: message.job, results: results, error: error })
    }
  }
}

export function sqlWorkerSource() {
  return `(${sqlWorkerMain.toString()})(self, ${JSON.stringify(SQLJS_BASE_URL)}, ${executeRuns.toString()});\n`
}
