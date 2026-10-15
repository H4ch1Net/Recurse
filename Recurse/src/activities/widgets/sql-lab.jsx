import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, CircleAlert, Eye, Lightbulb, Loader2, Play, RotateCcw, SkipForward, Table2, Wand2, X } from 'lucide-react'
import hljs from 'highlight.js/lib/core'
import sqlLanguage from 'highlight.js/lib/languages/sql'
import CodeEditor from '../../components/CodeEditor'
import CodeBlock from '../../components/CodeBlock'
import { Inline } from '../../components/RichText'
import { feedbackCorrect, feedbackWrong } from '../../lib/juice'
import { sfx } from '../../lib/sfx'
import { modKey } from '../lib/runner/editing'
import { loadSqlEngine, retrySqlEngine, runSqlBatch } from '../lib/sql/engine.js'
import { useSqlStatus, sqlStatusText } from '../lib/sql/useSql.js'
import { SETS, SET_IDS, changesData, exercisesFor, setFor } from '../lib/sql/exercises.js'
import { DATASETS } from '../lib/sql/datasets.js'
import { buildRun, buildSchemaRun, formatValue, parseSchema, scoreSet, statementSummary, toggleSqlComment } from '../lib/sql/lab.js'
import { errorText, gradeAttempt, sqlErrorHint } from '../lib/sql/grade.js'
import './sql-lab.css'

if (!hljs.getLanguage('sql')) hljs.registerLanguage('sql', sqlLanguage)

const SAMPLE_ROWS = 5
const SHOWN_ROWS = 100
const DEFAULT_STARTER = '-- Write your query below\n'

// Session caches: the reference results and table views never change for an exercise.
const refCache = new Map()
const schemaCache = new Map()

const refKey = (exercise) => `${exercise.dataset}|${exercise.id}|${exercise.solution}`

/** The reference solution's runs on the dataset and on the dataset with extra rows. */
function loadRefs(exercise) {
  const key = refKey(exercise)
  if (!refCache.has(key)) {
    const job = runSqlBatch([buildRun(exercise, exercise.solution, { grade: true }), buildRun(exercise, exercise.solution, { extra: true, grade: true })]).then((outcome) => {
      if (outcome.status !== 'ok') {
        refCache.delete(key)
        return { problem: outcome.message }
      }
      return { baseRef: outcome.results[0], extraRef: outcome.results[1] }
    })
    refCache.set(key, job)
  }
  return refCache.get(key)
}

function loadSchema(exercise) {
  const key = `${exercise.dataset}|${exercise.setup || ''}|${exercise.tables.join(',')}`
  if (!schemaCache.has(key)) {
    const job = runSqlBatch([buildSchemaRun(exercise)]).then((outcome) => {
      if (outcome.status !== 'ok') {
        schemaCache.delete(key)
        return null
      }
      return parseSchema(exercise, outcome.results[0])
    })
    schemaCache.set(key, job)
  }
  return schemaCache.get(key)
}

const tableOf = (query) => /\bFROM\s+([A-Za-z_]+)/i.exec(query)?.[1] || 'table'

const isWide = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 720px)').matches

/** SQL lab: write real SQL against SQLite in the browser and check it against the expected rows. */
export default function SqlLab({ props, onComplete, standalone }) {
  const [setId, setSetId] = useState(() => setFor(props.set))
  const [memory, setMemory] = useState({})
  const reported = useRef(new Set())
  const status = useSqlStatus()

  useEffect(() => {
    loadSqlEngine().catch(() => {})
  }, [])

  const only = standalone ? null : props.exercises
  const exercises = exercisesFor(setId, only)
  const state = memory[setId] || { index: 0, items: {} }

  const update = (fn) => setMemory((all) => ({ ...all, [setId]: fn(all[setId] || { index: 0, items: {} }) }))

  // helped: the solution was shown before this exercise was solved, so it earns half.
  const solve = (id, helped) => {
    const patch = { solved: true, helped: Boolean(helped) }
    const items = { ...state.items, [id]: { ...state.items[id], ...patch } }
    update((s) => ({ ...s, items: { ...s.items, [id]: { ...s.items[id], ...patch } } }))
    const score = scoreSet(exercises, items)
    if (score.complete && !reported.current.has(setId)) {
      reported.current.add(setId)
      onComplete?.({ score: score.score, detail: `${SETS[setId].title}: ${score.detail}` })
    }
  }

  return (
    <div className="sqllab">
      {standalone && (
        <div className="sqllab-sets" role="group" aria-label="Exercise set">
          {SET_IDS.map((id) => {
            const score = scoreSet(exercisesFor(id), memory[id]?.items)
            return (
              <button
                key={id}
                type="button"
                className={`sqllab-set${score.complete ? ' done' : ''}`}
                aria-pressed={id === setId}
                onClick={() => {
                  sfx.tap()
                  setSetId(id)
                }}
              >
                <span className="sqllab-set-title">{SETS[id].title}</span>
                <span className="sqllab-set-summary">{SETS[id].summary}</span>
                <span className="sqllab-set-count tabular">
                  {score.complete && <Check size={12} aria-hidden="true" />} {score.solved}/{score.total}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {status.state === 'error' && (
        <div className="callout bad sqllab-offline" role="alert">
          <CircleAlert size={18} />
          <div className="grow">
            <p>{status.message}</p>
            <button type="button" className="btn btn-sm" onClick={() => retrySqlEngine()}>
              <RotateCcw size={14} /> Try again
            </button>
          </div>
        </div>
      )}

      <SetRunner
        key={setId}
        setId={setId}
        exercises={exercises}
        state={state}
        status={status}
        onSelect={(index) => update((s) => ({ ...s, index }))}
        onItem={(id, patch) => update((s) => ({ ...s, items: { ...s.items, [id]: { ...s.items[id], ...patch } } }))}
        onSolved={solve}
      />
    </div>
  )
}

function SetRunner({ setId, exercises, state, status, onSelect, onItem, onSolved }) {
  const index = Math.min(state.index, exercises.length - 1)
  const exercise = exercises[index]
  const score = scoreSet(exercises, state.items)
  const nextUnsolved = () => {
    for (let step = 1; step <= exercises.length; step++) {
      const i = (index + step) % exercises.length
      if (!state.items[exercises[i].id]?.solved) return i
    }
    return -1
  }
  const next = nextUnsolved()
  const go = (i) => {
    sfx.tap()
    onSelect(i)
  }

  return (
    <div className="sqllab-set-runner">
      <div className="sqllab-progress">
        <div className="sqllab-progress-text">
          <strong className="tabular">
            {score.solved} of {score.total}
          </strong>{' '}
          solved
          <span className="xsmall muted"> · {SETS[setId].title}</span>
        </div>
        <div className="sqllab-bar" role="progressbar" aria-label="Exercises solved" aria-valuemin={0} aria-valuemax={score.total} aria-valuenow={score.solved}>
          <span style={{ width: `${(score.solved / Math.max(1, score.total)) * 100}%` }} />
        </div>
        {exercises.length > 1 && (
          <ol className="sqllab-steps" aria-label="Exercises">
            {exercises.map((ex, i) => {
              const solved = state.items[ex.id]?.solved
              return (
                <li key={ex.id}>
                  <button
                    type="button"
                    className={`sqllab-step${solved ? ' solved' : ''}`}
                    aria-current={i === index ? 'step' : undefined}
                    aria-label={`Exercise ${i + 1}: ${ex.title}${solved ? ', solved' : ''}`}
                    title={ex.title}
                    onClick={() => go(i)}
                  >
                    {solved ? <Check size={15} aria-hidden="true" /> : i + 1}
                  </button>
                </li>
              )
            })}
          </ol>
        )}
      </div>

      {score.complete && (
        <div className="callout good sqllab-complete" role="status">
          <Check size={18} />
          <span>
            Set complete: {score.detail}.{score.helped ? ' Try the ones you peeked at again later, without the solution.' : ''}
          </span>
        </div>
      )}

      <ExerciseView
        key={`${setId}/${exercise.id}`}
        exercise={exercise}
        number={index + 1}
        total={exercises.length}
        item={state.items[exercise.id] || {}}
        status={status}
        onItem={(patch) => onItem(exercise.id, patch)}
        onSolved={(helped) => onSolved(exercise.id, helped)}
        onNext={next !== -1 && next !== index ? () => go(next) : null}
      />
    </div>
  )
}

function ExerciseView({ exercise, number, total, item, status, onItem, onSolved, onNext }) {
  const modify = changesData(exercise)
  const starter = exercise.starter ?? DEFAULT_STARTER
  const code = item.code ?? starter
  const hintsShown = item.hints || 0
  const [busy, setBusy] = useState(null)
  const [output, setOutput] = useState(null)
  const [verdict, setVerdict] = useState(null)
  const [schema, setSchema] = useState(null)
  const [refs, setRefs] = useState(null)
  const [confirmReveal, setConfirmReveal] = useState(false)
  const [announce, setAnnounce] = useState('')
  const editorRef = useRef(null)
  const feedbackRef = useRef(null)
  const ready = status.state === 'ready'
  const mod = modKey()

  useEffect(() => {
    if (!ready) return undefined
    let live = true
    loadSchema(exercise).then((tables) => live && setSchema(tables))
    loadRefs(exercise).then((r) => live && setRefs(r))
    return () => {
      live = false
    }
  }, [exercise, ready])

  const setCode = (next) => onItem({ code: next })

  const run = async () => {
    if (busy) return
    sfx.tap()
    setBusy('run')
    setVerdict(null)
    setAnnounce('Running')
    const outcome = await runSqlBatch([buildRun(exercise, code)])
    setBusy(null)
    if (outcome.status !== 'ok') {
      setOutput({ problem: outcome.message })
      setAnnounce(outcome.message)
      sfx.error()
      return
    }
    const result = outcome.results[0]
    setOutput({ run: result })
    if (result.mine?.error) {
      setAnnounce(errorText(result.mine.error))
      sfx.error()
    } else {
      const rows = result.mine?.result?.rows.length
      setAnnounce(rows === undefined ? 'Done' : `${rows} ${rows === 1 ? 'row' : 'rows'}`)
    }
  }

  const check = async () => {
    if (busy) return
    sfx.tap()
    setBusy('check')
    setAnnounce('Checking')
    const reference = await loadRefs(exercise)
    if (reference.problem) {
      setBusy(null)
      setOutput({ problem: reference.problem })
      setAnnounce(reference.problem)
      return
    }
    setRefs(reference)
    const outcome = await runSqlBatch([buildRun(exercise, code, { grade: true }), buildRun(exercise, code, { extra: true, grade: true })])
    setBusy(null)
    if (outcome.status !== 'ok') {
      setOutput({ problem: outcome.message })
      setVerdict(null)
      setAnnounce(outcome.message)
      feedbackWrong(feedbackRef.current)
      return
    }
    const [base, extra] = outcome.results
    const result = gradeAttempt(exercise, code, { base, extra, ...reference })
    setOutput({ run: base, graded: true })
    setVerdict(result)
    setAnnounce(result.pass ? 'Correct' : result.message)
    if (result.pass) {
      feedbackCorrect(feedbackRef.current)
      if (!item.solved) onSolved(item.revealed)
    } else {
      feedbackWrong(feedbackRef.current)
    }
  }

  const showHint = () => {
    sfx.flip()
    onItem({ hints: Math.min(exercise.hints.length, hintsShown + 1) })
  }

  const reveal = () => {
    sfx.flip()
    setConfirmReveal(false)
    onItem({ revealed: true })
  }

  const useSolution = () => {
    sfx.pop()
    setCode(exercise.solution)
    editorRef.current?.focus()
  }

  const resetCode = () => {
    sfx.flip()
    setCode(starter)
    setOutput(null)
    setVerdict(null)
  }

  // Ctrl/Cmd + slash comments lines with -- (the shared editor only knows // and #).
  const onEditorKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey) || (event.key !== '/' && event.code !== 'Slash')) return
    const area = event.target
    if (area?.tagName !== 'TEXTAREA') return
    event.preventDefault()
    event.stopPropagation()
    const edit = toggleSqlComment(area.value, area.selectionStart, area.selectionEnd)
    if (!edit) return
    const expected = area.value.slice(0, edit.from) + edit.text + area.value.slice(edit.to)
    area.setSelectionRange(edit.from, edit.to)
    let inserted = false
    try {
      inserted = document.execCommand('insertText', false, edit.text)
    } catch {
      inserted = false
    }
    if (!inserted || area.value !== expected) setCode(expected)
    requestAnimationFrame(() => area.setSelectionRange(edit.selStart, edit.selEnd))
  }

  const loadingText = sqlStatusText(status)
  const solved = Boolean(item.solved)
  const revealed = Boolean(item.revealed)

  return (
    <article className="sqllab-exercise" aria-labelledby={`sqllab-title-${exercise.id}`}>
      <header className="sqllab-ex-head">
        <span className="xsmall muted tabular">
          Exercise {number} of {total} · {DATASETS[exercise.dataset].title}
        </span>
        <h4 id={`sqllab-title-${exercise.id}`} className="sqllab-ex-title">
          {exercise.title}
          {solved && (
            <span className="chip good sqllab-solved-chip">
              <Check size={12} /> Solved
            </span>
          )}
        </h4>
        <p className="sqllab-prompt">
          <Inline text={exercise.prompt} />
        </p>
        <div className="sqllab-tags">
          {exercise.ordered && <span className="chip outline">Row order matters</span>}
          {modify && <span className="chip outline">Changes data</span>}
          {exercise.setup && <span className="chip warn">A transaction is already open</span>}
        </div>
      </header>

      <SchemaView tables={schema} loading={!schema && status.state !== 'error'} />

      <ExpectedView exercise={exercise} refs={refs} />

      <div className="sqllab-editor" onKeyDownCapture={onEditorKeyDown}>
        <CodeEditor ref={editorRef} value={code} onChange={setCode} language="sql" onRun={run} onSubmit={check} label="SQL editor" minLines={Math.min(10, Math.max(5, exercise.solution.split('\n').length + 1))} />
      </div>

      <div className="sqllab-actions">
        <button type="button" className="btn" onClick={run} disabled={Boolean(busy)}>
          {busy === 'run' ? <Loader2 size={15} className="spin" /> : <Play size={15} />} Run
          <span className="kbd sqllab-kbd" aria-hidden="true">
            {mod} Enter
          </span>
        </button>
        <button type="button" className="btn btn-primary" onClick={check} disabled={Boolean(busy)}>
          {busy === 'check' ? <Loader2 size={15} className="spin" /> : <Check size={15} />} Check
          <span className="kbd sqllab-kbd" aria-hidden="true">
            {mod} Shift Enter
          </span>
        </button>
        <button type="button" className="btn btn-ghost" onClick={showHint} disabled={hintsShown >= exercise.hints.length}>
          <Lightbulb size={15} /> {hintsShown === 0 ? 'Hint' : hintsShown >= exercise.hints.length ? 'No more hints' : `Hint ${hintsShown + 1} of ${exercise.hints.length}`}
        </button>
        {!revealed && !confirmReveal && (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmReveal(true)}>
            <Eye size={15} /> Solution
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={resetCode} disabled={code === starter}>
          <RotateCcw size={15} /> Reset
        </button>
      </div>

      {confirmReveal && (
        <div className="sqllab-confirm" role="group" aria-label="Show the solution?">
          <span className="small">
            {solved ? 'You solved this one already. Show the reference solution?' : 'Show the solution? You can still solve it afterwards, but it counts for half.'}
          </span>
          <span className="row">
            <button type="button" className="btn btn-sm btn-primary" onClick={reveal}>
              Show it
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmReveal(false)}>
              Not yet
            </button>
          </span>
        </div>
      )}

      {hintsShown > 0 && (
        <ol className="sqllab-hints" aria-label="Hints">
          {exercise.hints.slice(0, hintsShown).map((hint, i) => (
            <li key={i}>
              <Lightbulb size={14} aria-hidden="true" />
              <span>
                <Inline text={hint} />
              </span>
            </li>
          ))}
        </ol>
      )}

      <div ref={feedbackRef} className="sqllab-feedback-anchor">
        {verdict && (
          <div className={`callout ${verdict.pass ? 'good' : verdict.kind === 'second-check' || verdict.kind === 'missing' ? 'warn' : 'bad'} sqllab-verdict`}>
            {verdict.pass ? <Check size={18} /> : <X size={18} />}
            <div className="grow">
              <p>{verdict.message}</p>
              {verdict.hint && <p className="small sqllab-hint-line">{verdict.hint}</p>}
            </div>
          </div>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {announce}
      </p>

      <OutputView output={output} busy={busy} loadingText={loadingText} exercise={exercise} refProbes={refs?.baseRef?.probes} />

      {(revealed || solved) && (
        <div className="sqllab-explain">
          {revealed && (
            <>
              <CodeBlock code={exercise.solution} language="sql" label="Reference solution" />
              {code !== exercise.solution && (
                <button type="button" className="btn btn-sm" onClick={useSolution}>
                  <Wand2 size={14} /> Put it in the editor
                </button>
              )}
            </>
          )}
          <p className="small">
            <Inline text={exercise.explain} />
          </p>
          {solved && !revealed && !confirmReveal && <p className="xsmall muted">Curious how the reference solution does it? Use Solution above; it does not change your score now.</p>}
        </div>
      )}

      {solved && onNext && (
        <button type="button" className="btn btn-primary sqllab-next" onClick={onNext}>
          Next exercise <SkipForward size={15} />
        </button>
      )}
    </article>
  )
}

function SchemaView({ tables, loading }) {
  const [wide] = useState(isWide)
  if (loading) {
    return (
      <div className="sqllab-schema sqllab-schema-loading">
        <Loader2 size={14} className="spin" /> Loading the tables
      </div>
    )
  }
  if (!tables) return null
  return (
    <section className="sqllab-schema" aria-label="Tables">
      {tables.map((table) => (
        <TableCard key={table.name} table={table} defaultOpen={wide} />
      ))}
    </section>
  )
}

function TableCard({ table, defaultOpen }) {
  const [rowsMode, setRowsMode] = useState('none')
  const count = table.data.rows.length
  const shown = rowsMode === 'all' ? table.data.rows : table.data.rows.slice(0, SAMPLE_ROWS)
  return (
    <details className="sqllab-table-card" open={defaultOpen}>
      <summary>
        <Table2 size={15} aria-hidden="true" />
        <span className="mono sqllab-table-name">{table.name}</span>
        <span className="xsmall muted tabular">
          {count} {count === 1 ? 'row' : 'rows'}
        </span>
        <ChevronDown size={15} className="sqllab-chevron" aria-hidden="true" />
      </summary>
      <ul className="sqllab-columns">
        {table.columns.map((column) => (
          <li key={column.name}>
            <span className="mono sqllab-col-name">{column.name}</span>
            <span className="sqllab-col-type">{column.type.toLowerCase()}</span>
            {column.pk && <span className="sqllab-badge key">key</span>}
            {column.ref && <span className="sqllab-badge ref">→ {column.ref}</span>}
            {column.notNull && !column.pk && <span className="sqllab-badge">required</span>}
          </li>
        ))}
      </ul>
      <div className="sqllab-table-tools">
        {rowsMode === 'none' ? (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRowsMode('sample')} disabled={!count}>
            {count ? `Show ${Math.min(SAMPLE_ROWS, count)} sample rows` : 'No rows yet'}
          </button>
        ) : (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRowsMode('none')}>
            Hide rows
          </button>
        )}
        {rowsMode === 'sample' && count > SAMPLE_ROWS && (
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRowsMode('all')}>
            Show all {count}
          </button>
        )}
      </div>
      {rowsMode !== 'none' && <ResultTable result={{ columns: table.data.columns, rows: shown }} label={`Rows of ${table.name}`} compact />}
      {table.createSql && (
        <details className="sqllab-create">
          <summary className="xsmall">CREATE TABLE statement</summary>
          <pre className="mono">{table.createSql}</pre>
        </details>
      )}
    </details>
  )
}

function ExpectedView({ exercise, refs }) {
  const modify = changesData(exercise)
  const ref = refs?.baseRef
  return (
    <details className="sqllab-expected">
      <summary>
        <span>{modify ? 'Expected data afterwards' : 'Expected result'}</span>
        {ref && !modify && ref.mine?.result && (
          <span className="xsmall muted tabular">
            {ref.mine.result.rows.length} {ref.mine.result.rows.length === 1 ? 'row' : 'rows'}
          </span>
        )}
        <ChevronDown size={15} className="sqllab-chevron" aria-hidden="true" />
      </summary>
      {!ref ? (
        <p className="small muted">{refs?.problem || 'Loading...'}</p>
      ) : modify ? (
        <div className="stack sqllab-expected-body">
          {ref.probes.length > 0 && <ProbeList probes={ref.probes} />}
          {ref.checks.map((c, i) =>
            c.result ? <ResultTable key={i} result={c.result} label={`${tableOf(exercise.verify[i])}${ref.probes.length ? ' after the test inserts' : ''}`} /> : null
          )}
        </div>
      ) : (
        <ResultTable result={ref.mine.result} label="Expected result" />
      )}
    </details>
  )
}

function ProbeList({ probes, expected }) {
  return (
    <div className="sqllab-probes">
      <p className="xsmall muted">Test inserts run after your statements</p>
      <ul>
        {probes.map((probe, i) => {
          const wrong = expected && expected[i] && expected[i].ok !== probe.ok
          return (
            <li key={probe.label} className={wrong ? 'wrong' : ''}>
              <span className={`sqllab-badge ${probe.ok ? 'ok' : 'no'}`}>{probe.ok ? 'accepted' : 'rejected'}</span>
              <span>{probe.label}</span>
              {wrong && <span className="xsmall sqllab-probe-want">should be {expected[i].ok ? 'accepted' : 'rejected'}</span>}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function OutputView({ output, busy, loadingText, exercise, refProbes }) {
  if (busy && loadingText) {
    return (
      <div className="sqllab-output sqllab-output-wait" role="status">
        <Loader2 size={15} className="spin" /> {loadingText}...
      </div>
    )
  }
  if (!output) {
    return (
      <div className="sqllab-output sqllab-output-empty">
        <span className="small muted">{loadingText ? `${loadingText}...` : 'Run your SQL to see the result here. Check compares it with the expected result.'}</span>
      </div>
    )
  }
  if (output.problem) {
    return (
      <div className="sqllab-output">
        <div className="sqllab-error" role="alert">
          <CircleAlert size={16} />
          <span>{output.problem}</span>
        </div>
      </div>
    )
  }
  const { run, graded } = output
  const mine = run.mine
  if (!mine) {
    return (
      <div className="sqllab-output">
        <div className="sqllab-error" role="alert">
          <CircleAlert size={16} />
          <span>The database could not be prepared: {run.setupError}</span>
        </div>
      </div>
    )
  }
  const showStatements = mine.statements.length > 1 || mine.statements.some((s) => !s.columns)
  const hint = mine.error ? sqlErrorHint(mine.error.message) : ''
  return (
    <div className="sqllab-output">
      {showStatements && (
        <ul className="sqllab-statements">
          {mine.statements.map((s, i) => (
            <li key={i}>
              <Check size={13} aria-hidden="true" /> {statementSummary(s)}
            </li>
          ))}
        </ul>
      )}
      {mine.error && (
        <div className="sqllab-error" role="alert">
          <CircleAlert size={16} />
          <div>
            <p className="mono">{errorText(mine.error)}</p>
            {hint && <p className="small">{hint}</p>}
          </div>
        </div>
      )}
      {!mine.error && mine.result && <ResultTable result={mine.result} label="Your result" ms={mine.ms} />}
      {!mine.error && !mine.result && !mine.statements.length && <p className="small muted">Nothing ran. Write a statement and end it with a semicolon.</p>}
      {graded && run.probes.length > 0 && <ProbeList probes={run.probes} expected={refProbes} />}
      {!mine.error &&
        run.checks.map((c, i) =>
          c.result ? (
            <ResultTable key={i} result={c.result} label={`${tableOf(exercise.verify[i])} ${graded && run.probes.length ? 'after the test inserts' : 'after your statements'}`} />
          ) : (
            <p key={i} className="small muted">
              Could not read {tableOf(exercise.verify[i])}: {c.error}
            </p>
          )
        )}
    </div>
  )
}

function ResultTable({ result, label, ms, compact = false }) {
  const rows = result.rows.slice(0, SHOWN_ROWS)
  const total = result.rows.length
  return (
    <div className={`sqllab-result${compact ? ' compact' : ''}`}>
      {!compact && (
        <div className="sqllab-result-head">
          <span className="sqllab-result-label">{label}</span>
          <span className="xsmall muted tabular">
            {result.truncated ? 'more than ' : ''}
            {total} {total === 1 ? 'row' : 'rows'}
            {typeof ms === 'number' ? ` · ${ms} ms` : ''}
          </span>
        </div>
      )}
      <div className="sqllab-table-wrap" tabIndex={0} role="region" aria-label={label}>
        <table className="sqllab-table">
          <thead>
            <tr>
              {result.columns.map((column, i) => (
                <th key={i} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r}>
                {row.map((value, c) => (
                  <td key={c} className={value === null ? 'null' : typeof value === 'number' ? 'num' : undefined}>
                    {formatValue(value)}
                  </td>
                ))}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="sqllab-no-rows" colSpan={Math.max(1, result.columns.length)}>
                  No rows
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > rows.length && (
        <p className="xsmall muted">
          Showing the first {rows.length} of {result.truncated ? 'more than ' : ''}
          {total} rows.
        </p>
      )}
    </div>
  )
}
