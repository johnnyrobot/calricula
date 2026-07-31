"use client";

import {
  Check,
  CloudOff,
  Database,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Wifi,
} from "lucide-react";
import Link from "next/link";
import {
  probeConnectivity,
  useConnectivityStatus,
} from "@/lib/pwa/connectivity";

export default function OfflinePage() {
  const online = useConnectivityStatus();

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Continuity on this device</p>
          <h1 className="folio-title">Offline use</h1>
          <p className="page-deck">
            Curriculum records already stored in this browser remain local and are
            designed to stay available when a connection drops.
          </p>
        </div>
        <div className="page-actions">
          <span
            className={`status-seal ${
              online ? "status-seal--approved" : "status-seal--returned"
            }`}
            role="status"
            aria-live="polite"
          >
            {online ? <Wifi aria-hidden="true" size={15} /> : <CloudOff aria-hidden="true" size={15} />}
            {online ? "Online now" : "Offline now"}
          </span>
        </div>
      </header>

      <div className="offline-illustration" aria-hidden="true">
        <CloudOff />
      </div>

      <div className="info-layout">
        <nav aria-label="Offline guide sections">
          <ul className="info-index">
            <li>
              <a href="#available">Available offline</a>
            </li>
            <li>
              <a href="#requires-network">Needs a network</a>
            </li>
            <li>
              <a href="#prepare">Prepare</a>
            </li>
          </ul>
        </nav>

        <div className="info-sections">
          <section
            className="info-section"
            id="available"
            aria-labelledby="available-title"
          >
            <p className="eyebrow">Local-first records</p>
            <h2 id="available-title">What remains available</h2>
            <ul className="check-list">
              <li>
                <Check aria-hidden="true" />
                <span>
                  Courses, programs, comments, notifications, and workflow
                  history already stored in this browser.
                </span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>
                  Drafting and editing local records, including the built-in
                  deterministic compliance checks.
                </span>
              </li>
              <li>
                <Check aria-hidden="true" />
                <span>
                  Backup export, import, role perspectives, and sample-data reset.
                </span>
              </li>
            </ul>
            <p>
              Availability depends on the app having completed an online load on
              this device and on the browser retaining this site&apos;s cached files
              and local storage.
            </p>
          </section>

          <section
            className="info-section"
            id="requires-network"
            aria-labelledby="network-title"
          >
            <p className="eyebrow">Connection boundary</p>
            <h2 id="network-title">What waits for a network</h2>
            <ul className="check-list">
              <li>
                <Sparkles aria-hidden="true" />
                <span>
                  AI requests, including Turnstile verification, the anonymous
                  session, and OpenRouter model routing.
                </span>
              </li>
              <li>
                <RefreshCw aria-hidden="true" />
                <span>
                  Checking for and downloading a newer version of the app.
                </span>
              </li>
              <li>
                <Wifi aria-hidden="true" />
                <span>
                  Any browser or operating-system service that itself requires a
                  connection, including first-time installation.
                </span>
              </li>
            </ul>
            <div className="callout">
              <h3>No sync queue is implied</h3>
              <p>
                This demo has no account or cloud database. Local edits do not
                wait to “sync” to another device when connectivity returns.
              </p>
            </div>
          </section>

          <section
            className="info-section"
            id="prepare"
            aria-labelledby="prepare-title"
          >
            <p className="eyebrow">Before you disconnect</p>
            <h2 id="prepare-title">Prepare this device</h2>
            <ol className="space-y-4 pl-5">
              <li>Open Calricula while online and let the local catalog finish loading.</li>
              <li>
                Install the progressive web app if your browser supports
                installation.
              </li>
              <li>
                Request persistent storage and download a current backup from
                Settings.
              </li>
              <li>
                Open the records you expect to use and confirm they appear before
                leaving the network.
              </li>
            </ol>
            <div className="setting-actions">
              <Link className="luminous-button-primary" href="/settings/#storage">
                <ShieldCheck aria-hidden="true" size={17} />
                Prepare storage
              </Link>
              <Link className="luminous-button-secondary" href="/dashboard/">
                <Database aria-hidden="true" size={17} />
                Open local catalog
              </Link>
              {!online && (
                <button
                  className="luminous-button-tertiary"
                  type="button"
                  onClick={() => void probeConnectivity()}
                >
                  <RefreshCw aria-hidden="true" size={17} />
                  Try connection again
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
