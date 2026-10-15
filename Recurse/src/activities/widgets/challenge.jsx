import ChallengeView from '../../components/ChallengeView'

/** Activity wrapper: the challenge chosen by props.id, with the activity frame around it. */
export default function ChallengeWidget({ props, onComplete, standalone }) {
  return <ChallengeView id={props.id} standalone={standalone} onComplete={onComplete} />
}
