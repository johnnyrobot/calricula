import {
  ArrowRight,
  BookOpenCheck,
  Check,
  FileLock2,
  Laptop,
  Scale,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/shell/BrandMark";
import { InstallButton } from "@/components/shell/InstallButton";

export default function HomePage() {
  return (
    <div className="landing">
      <script
        dangerouslySetInnerHTML={{
          __html:
            'if("serviceWorker"in navigator){addEventListener("load",()=>{navigator.serviceWorker.register("/sw.js",{scope:"/"}).catch(()=>console.warn("[calricula:pwa] Offline service-worker registration failed."))},{once:true})}',
        }}
      />
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>

      <header className="landing-header">
        <BrandMark />
        <nav className="landing-nav" aria-label="Public navigation">
          <Link href="#how-it-works">How it works</Link>
          <Link href="#privacy">Privacy</Link>
          <Link href="/accessibility/">Accessibility</Link>
          <Link
            className="luminous-button-primary landing-try-link"
            href="/dashboard/"
          >
            Try it now
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        </nav>
      </header>

      <main id="main-content">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-copy">
            <p className="eyebrow">California curriculum, thoughtfully arranged</p>
            <h1 className="landing-title" id="landing-title">
              From first draft to <em>record.</em>
            </h1>
            <p className="landing-lede">
              Shape Course Outlines of Record and programs in a focused workspace
              with California compliance guidance close at hand.
            </p>
            <div className="landing-actions">
              <Link className="luminous-button-primary" href="/dashboard/">
                Try it now
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <InstallButton />
            </div>
            <p className="landing-note">
              No account is required. Your first visit creates sample curriculum
              records in this browser so you can explore immediately.
            </p>
          </div>

          <aside className="landing-ledger" aria-labelledby="ledger-title">
            <div className="landing-ledger-header">
              <h2 id="ledger-title">A curriculum desk</h2>
              <span className="folio-number">folio 01</span>
            </div>
            <div className="ledger-entry">
              <span className="ledger-index" aria-hidden="true">
                I
              </span>
              <div>
                <h3>Author with context</h3>
                <p>
                  Draft outcomes, content, units, codes, and requisites together
                  instead of chasing disconnected forms.
                </p>
              </div>
            </div>
            <div className="ledger-entry">
              <span className="ledger-index" aria-hidden="true">
                II
              </span>
              <div>
                <h3>Review the whole record</h3>
                <p>
                  Follow a clear demo workflow across faculty, chair,
                  articulation, and administrator perspectives.
                </p>
              </div>
            </div>
            <div className="ledger-entry">
              <span className="ledger-index" aria-hidden="true">
                III
              </span>
              <div>
                <h3>Keep custody of the work</h3>
                <p>
                  Core records stay in this browser. Export a backup whenever you
                  want a portable copy.
                </p>
              </div>
            </div>
          </aside>
        </section>

        <section
          className="landing-section"
          id="how-it-works"
          aria-labelledby="principles-title"
        >
          <div className="landing-section-inner">
            <p className="eyebrow">Designed around the record</p>
            <h2 className="landing-section-title" id="principles-title">
              Serious structure, without the institutional overhead.
            </h2>
            <div className="principles-grid">
              <article className="principle">
                <BookOpenCheck aria-hidden="true" />
                <h3>Embedded guidance</h3>
                <p>
                  Title 5, PCAH, common-course numbering, and local checks appear
                  in context as drafting aids—not as an afterthought.
                </p>
              </article>
              <article className="principle">
                <Workflow aria-hidden="true" />
                <h3>Role-aware review</h3>
                <p>
                  Switch demo perspectives to understand handoffs and decisions
                  across a representative approval path.
                </p>
              </article>
              <article className="principle">
                <Laptop aria-hidden="true" />
                <h3>Local-first workspace</h3>
                <p>
                  Keep working with the records already on your device, even when
                  the network is unavailable. AI actions wait for a connection.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section
          className="landing-section landing-section--navy"
          id="privacy"
          aria-labelledby="privacy-title"
        >
          <div className="landing-section-inner disclosure-grid">
            <div>
              <p className="eyebrow" style={{ color: "#e1bd5e" }}>
                A transparent demonstration
              </p>
              <h2 className="landing-section-title" id="privacy-title">
                Local by default. AI only when you ask.
              </h2>
              <p>
                Core curriculum data is stored in this browser. If you explicitly
                use an AI action, the submitted content and included chat history
                leave your device through Calricula&apos;s Cloudflare Worker and
                OpenRouter to an available model provider.
              </p>
              <Link
                className="luminous-button-secondary"
                href="/settings/#privacy"
                style={{ marginTop: "1rem" }}
              >
                Read the data boundaries
              </Link>
            </div>
            <ul className="disclosure-list">
              <li>
                <FileLock2 aria-hidden="true" />
                <span>
                  The browser never receives the OpenRouter key or model-routing
                  controls. The worker does not persist or log prompt and response
                  content.
                </span>
              </li>
              <li>
                <ShieldCheck aria-hidden="true" />
                <span>
                  AI requests ask providers to deny data collection and use
                  zero-data-retention routing, but provider handling remains
                  subject to OpenRouter and provider policies.
                </span>
              </li>
              <li>
                <Sparkles aria-hidden="true" />
                <span>
                  AI is optional, rate-limited, and not authoritative. Review
                  every suggestion against current law, policy, and local practice.
                </span>
              </li>
              <li>
                <Scale aria-hidden="true" />
                <span>
                  This demo does not provide accounts, cloud sync, true multi-user
                  routing, guaranteed model availability, or legal and compliance
                  determinations.
                </span>
              </li>
              <li>
                <FileLock2 aria-hidden="true" />
                <span>
                  It does not connect to eLumen, labor-market data, or other
                  institutional systems. File uploads, push notifications,
                  server backups, and program approval routing are not included.
                </span>
              </li>
              <li>
                <FileLock2 aria-hidden="true" />
                <span>
                  This edition does not use Firebase sign-in, a FastAPI or
                  PostgreSQL application backend, Gemini or File Search, local
                  document indexing, or cross-list synchronization.
                </span>
              </li>
            </ul>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="ready-title">
          <div className="landing-section-inner">
            <p className="eyebrow">Open the sample catalog</p>
            <h2 className="landing-section-title" id="ready-title">
              Start where curriculum work starts: with the record in front of you.
            </h2>
            <div className="landing-actions">
              <Link className="luminous-button-primary" href="/dashboard/">
                Enter the demo
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
              <Link className="luminous-button-tertiary" href="/accessibility/">
                <Check aria-hidden="true" size={17} />
                Accessibility commitments
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-inner">
          <BrandMark inverse compact />
          <nav aria-label="Footer navigation">
            <Link href="/accessibility/">Accessibility</Link>
            <Link href="/offline/">Offline use</Link>
            <Link href="/settings/#privacy">Data &amp; privacy</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
