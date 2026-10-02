import Link from 'next/link'

export default function AuthErrorPage() {
  return (
    <main className="auth-screen">
      <section className="auth-card" aria-labelledby="auth-error-heading">
        <div className="brand-lockup"><span>LEAD<span className="accent-text">TRENCH</span></span></div>
        <div className="auth-eyebrow">ACCOUNT CONFIRMATION</div>
        <h1 id="auth-error-heading">LINK <span>UNAVAILABLE</span></h1>
        <p className="auth-description">This confirmation link is invalid or has expired. Request a fresh link by creating an account again, or return to sign in.</p>
        <Link className="primary-button auth-submit" href="/">Return to LeadTrench</Link>
      </section>
    </main>
  )
}
