import { Component } from 'react'
import { Inline } from '../RichText'
import Table from './Table'
import Compare from './Compare'
import Steps from './Steps'
import Flow from './Flow'
import Stack from './Stack'
import Bars from './Bars'
import Sequence from './Sequence'
import Topology from './Topology'
import Tree from './Tree'
import Fields from './Fields'
import Bits from './Bits'
import Cells from './Cells'
import './visuals.css'

const RENDERERS = { table: Table, compare: Compare, steps: Steps, flow: Flow, stack: Stack, bars: Bars, sequence: Sequence, topology: Topology, tree: Tree, fields: Fields, bits: Bits, cells: Cells }

/** One broken visual shows a quiet note instead of taking the lesson down with it. */
class VisualBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error) {
    console.error('Visual failed to draw:', error)
  }
  render() {
    return this.state.failed ? <p className="visual-failed small subtle">This diagram could not be drawn.</p> : this.props.children
  }
}

/** A lesson visual: a table, diagram, worked example or chart drawn from its spec (docs/visuals.md). */
export default function Visual({ spec }) {
  const Renderer = RENDERERS[spec?.type]
  if (!Renderer) return null
  return (
    <figure className={`visual visual-${spec.type}`}>
      {spec.title && <figcaption className="visual-title"><Inline text={spec.title} /></figcaption>}
      <VisualBoundary>
        <Renderer spec={spec} />
      </VisualBoundary>
      {spec.caption && <p className="visual-caption"><Inline text={spec.caption} /></p>}
    </figure>
  )
}
