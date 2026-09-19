import {
  Check,
  Eye,
  Focus,
  Keyboard,
  MessageSquareWarning,
  MousePointer2,
  ScanText,
  Volume2,
  ZoomIn,
} from "lucide-react";
import Link from "next/link";

export default function AccessibilityPage() {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Access is part of the record</p>
          <h1 className="folio-title">Accessibility</h1>
          <p className="page-deck">
            Calricula is designed toward WCAG 2.2 Level AA so curriculum work
            remains usable across input methods, screen sizes, and assistive
            technologies.
          </p>
        </div>
      </header>

      <div className="info-layout">
        <nav aria-label="Accessibility statement sections">
          <ul className="info-index">
            <li>
              <a href="#commitment">Commitment</a>
            </li>
            <li>
              <a href="#features">Features</a>
            </li>
            <li>
              <a href="#keyboard">Keyboard</a>
            </li>
            <li>
              <a href="#limits">Known limits</a>
            </li>
            <li>
              <a href="#feedback">Feedback</a>
            </li>
          </ul>
        </nav>

        <div className="info-sections">
          <section
            className="info-section"
            id="commitment"
            aria-labelledby="commitment-title"
          >
            <p className="eyebrow">Our target</p>
            <h2 id="commitment-title">WCAG 2.2 Level AA</h2>
            <p>
              The demo uses semantic page landmarks, visible focus, keyboard
              operability, high-contrast text, responsive reflow, and
              reduced-motion support. Accessibility is treated as an ongoing
              engineering requirement, not a one-time certification.
            </p>
            <div className="callout">
              <h3>Statement boundary</h3>
              <p>
                This page describes the intended behavior of this demonstration.
                It is not a third-party accessibility certification or a completed
                Accessibility Conformance Report.
              </p>
            </div>
          </section>

          <section
            className="info-section"
            id="features"
            aria-labelledby="features-title"
          >
            <p className="eyebrow">Built into the interface</p>
            <h2 id="features-title">Accessibility features</h2>
            <ul className="check-list">
              <li>
                <Keyboard aria-hidden="true" />
                <span>
                  Navigation, forms, dialogs, role switching, backup, import, and
                  reset controls are operable from a keyboard.
                </span>
              </li>
              <li>
                <Focus aria-hidden="true" />
                <span>
                  A consistent, high-contrast focus indicator shows the current
                  keyboard target. A skip link moves directly to main content.
                </span>
              </li>
              <li>
                <Volume2 aria-hidden="true" />
                <span>
                  Landmarks, headings, table captions, field labels, status
                  regions, and error alerts provide screen-reader structure.
                </span>
              </li>
              <li>
                <Eye aria-hidden="true" />
                <span>
                  Status is expressed with text as well as color. Decorative gold
                  is not used for small essential text.
                </span>
              </li>
              <li>
                <MousePointer2 aria-hidden="true" />
                <span>
                  Primary interactive targets are at least 44 by 44 CSS pixels,
                  with spacing that supports touch and alternative pointing input.
                </span>
              </li>
              <li>
                <ZoomIn aria-hidden="true" />
                <span>
                  Layouts reflow at narrow widths and support browser text resize
                  and zoom without requiring a two-dimensional page scroll.
                  Wide record tables use a contained horizontal region.
                </span>
              </li>
              <li>
                <ScanText aria-hidden="true" />
                <span>
                  Serif headings distinguish the document hierarchy while a
                  readable sans serif supports controls and dense record data.
                </span>
              </li>
            </ul>
          </section>

          <section
            className="info-section"
            id="keyboard"
            aria-labelledby="keyboard-title"
          >
            <p className="eyebrow">Input without a pointer</p>
            <h2 id="keyboard-title">Keyboard guide</h2>
            <dl className="definition-list">
              <div className="definition-row">
                <dt>
                  <span className="keyboard-key">Tab</span>
                </dt>
                <dd>Move to the next interactive control.</dd>
              </div>
              <div className="definition-row">
                <dt>
                  <span className="keyboard-key">Shift</span> +{" "}
                  <span className="keyboard-key">Tab</span>
                </dt>
                <dd>Move to the previous interactive control.</dd>
              </div>
              <div className="definition-row">
                <dt>
                  <span className="keyboard-key">Enter</span> /{" "}
                  <span className="keyboard-key">Space</span>
                </dt>
                <dd>Open links and activate the focused control.</dd>
              </div>
              <div className="definition-row">
                <dt>
                  <span className="keyboard-key">Esc</span>
                </dt>
                <dd>Close an open confirmation dialog without taking action.</dd>
              </div>
            </dl>
            <p>
              At the start of each page, press <span className="keyboard-key">Tab</span>{" "}
              once to reveal the “Skip to main content” link.
            </p>
          </section>

          <section
            className="info-section"
            id="limits"
            aria-labelledby="limits-title"
          >
            <p className="eyebrow">Current boundaries</p>
            <h2 id="limits-title">Known limits and third parties</h2>
            <ul>
              <li>
                The optional AI flow can include third-party Turnstile and model
                services whose accessibility is not fully controlled by this app.
              </li>
              <li>
                Browser-provided installation, file selection, download, and
                storage-permission interfaces vary by browser and operating
                system.
              </li>
              <li>
                Very wide curriculum record tables may scroll horizontally inside
                a labeled table region at high zoom.
              </li>
            </ul>
            <div className="callout callout--warning">
              <h3>Human review remains necessary</h3>
              <p>
                AI output can contain inaccessible formatting or unclear language.
                Authors are responsible for reviewing content before it becomes a
                curriculum record.
              </p>
            </div>
          </section>

          <section
            className="info-section"
            id="feedback"
            aria-labelledby="feedback-title"
          >
            <p className="eyebrow">Help improve the demo</p>
            <h2 id="feedback-title">Report an accessibility barrier</h2>
            <p>
              When reporting a barrier through the project&apos;s issue tracker,
              include the page, what you were trying to do, your browser and
              assistive technology, and the behavior you expected. Do not include
              student records or other confidential data.
            </p>
            <div className="setting-actions">
              <Link className="luminous-button-primary" href="/dashboard/">
                <Check aria-hidden="true" size={17} />
                Return to dashboard
              </Link>
              <Link className="luminous-button-secondary" href="/settings/">
                <MessageSquareWarning aria-hidden="true" size={17} />
                Review data settings
              </Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
