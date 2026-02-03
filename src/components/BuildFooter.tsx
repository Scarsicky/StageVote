export default function BuildFooter() {
  const time = new Date(__BUILD_TIME__).toLocaleString()

  return (
    <div style={{
      marginTop: 32,
      paddingTop: 12,
      fontSize: '0.75rem',
      opacity: 0.6,
      borderTop: '1px solid #ddd',
      textAlign: 'center',
    }}>
      StageVote v{__APP_VERSION__} • build {time}
    </div>
  )
}
