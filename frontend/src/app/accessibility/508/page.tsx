'use client';

// ===========================================
// Section 508 ACR Page
// ===========================================
// Displays the Accessibility Conformance Report (Section 508 Edition)
// for Calricula v1.0

import Link from 'next/link';
import { AcademicCapIcon, ArrowLeftIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

// ===========================================
// Types
// ===========================================

interface CriteriaRow {
  criteria: string;
  url: string;
  level: string;
  remarks: string;
}

// ===========================================
// WCAG Criteria Table Component
// ===========================================

interface WCAGTableProps {
  title: string;
  rows: CriteriaRow[];
  caption?: string;
}

const WCAGTable: React.FC<WCAGTableProps> = ({ title, rows, caption }) => (
  <div className="mb-8">
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
    {caption && (
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{caption}</p>
    )}
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-slate-300 dark:border-slate-600">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-700">
            <th scope="col" className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
              Criteria
            </th>
            <th scope="col" className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
              Conformance Level
            </th>
            <th scope="col" className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
              Remarks and Explanations
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-750'}>
              <td className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 underline"
                >
                  {row.criteria}
                </a>
              </td>
              <td className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                {row.level}
              </td>
              <td className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                {row.remarks}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ===========================================
// Simple Table Component (for non-WCAG tables)
// ===========================================

interface SimpleTableProps {
  title: string;
  headers: string[];
  rows: string[][];
  caption?: string;
}

const SimpleTable: React.FC<SimpleTableProps> = ({ title, headers, rows, caption }) => (
  <div className="mb-8">
    {title && <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>}
    {caption && (
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{caption}</p>
    )}
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-slate-300 dark:border-slate-600">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-700">
            {headers.map((header, i) => (
              <th
                key={i}
                scope="col"
                className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-750'}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line"
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ===========================================
// Section 508 Table Component
// ===========================================

interface Section508Row {
  criteria: string;
  url?: string;
  level: string;
  remarks: string;
}

interface Section508TableProps {
  title: string;
  rows: Section508Row[];
  caption?: string;
}

const Section508Table: React.FC<Section508TableProps> = ({ title, rows, caption }) => (
  <div className="mb-8">
    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">{title}</h3>
    {caption && (
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{caption}</p>
    )}
    <div className="overflow-x-auto">
      <table className="w-full border-collapse border border-slate-300 dark:border-slate-600">
        <thead>
          <tr className="bg-slate-100 dark:bg-slate-700">
            <th scope="col" className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
              Criteria
            </th>
            <th scope="col" className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
              Conformance Level
            </th>
            <th scope="col" className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-left text-sm font-semibold text-slate-900 dark:text-white">
              Remarks and Explanations
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-slate-50 dark:bg-slate-750'}>
              <td className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                {row.url ? (
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 underline"
                  >
                    {row.criteria}
                  </a>
                ) : (
                  row.criteria
                )}
              </td>
              <td className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                {row.level}
              </td>
              <td className="border border-slate-300 dark:border-slate-600 px-4 py-3 text-sm text-slate-700 dark:text-slate-300">
                {row.remarks}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  </div>
);

// ===========================================
// WCAG Level A Criteria Data
// ===========================================

const wcagLevelAData: CriteriaRow[] = [
  { criteria: '1.1.1 Non-text Content', url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html', level: 'Supports', remarks: 'All images have appropriate alt text. Decorative icons use aria-hidden="true". Interactive icons have accessible labels.' },
  { criteria: '1.2.1 Audio-only and Video-only (Prerecorded)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/audio-only-and-video-only-prerecorded.html', level: 'Not Applicable', remarks: 'The application does not contain audio-only or video-only content.' },
  { criteria: '1.2.2 Captions (Prerecorded)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/captions-prerecorded.html', level: 'Not Applicable', remarks: 'The application does not contain prerecorded synchronized media.' },
  { criteria: '1.2.3 Audio Description or Media Alternative (Prerecorded)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/audio-description-or-media-alternative-prerecorded.html', level: 'Not Applicable', remarks: 'The application does not contain prerecorded synchronized media.' },
  { criteria: '1.3.1 Info and Relationships', url: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html', level: 'Supports', remarks: 'The application uses semantic HTML5 for all content. The login page uses <main> for primary content, the sidebar uses <aside> with aria-label for navigation regions.' },
  { criteria: '1.3.2 Meaningful Sequence', url: 'https://www.w3.org/WAI/WCAG21/Understanding/meaningful-sequence.html', level: 'Supports', remarks: 'Content is presented in a logical reading order that matches the DOM structure.' },
  { criteria: '1.3.3 Sensory Characteristics', url: 'https://www.w3.org/WAI/WCAG21/Understanding/sensory-characteristics.html', level: 'Supports', remarks: 'Instructions do not rely solely on sensory characteristics such as shape, size, or location.' },
  { criteria: '1.4.1 Use of Color', url: 'https://www.w3.org/WAI/WCAG21/Understanding/use-of-color.html', level: 'Supports', remarks: 'Color is not used as the only visual means of conveying information. Status badges use both color and text labels.' },
  { criteria: '1.4.2 Audio Control', url: 'https://www.w3.org/WAI/WCAG21/Understanding/audio-control.html', level: 'Not Applicable', remarks: 'The application does not contain audio that plays automatically.' },
  { criteria: '2.1.1 Keyboard', url: 'https://www.w3.org/WAI/WCAG21/Understanding/keyboard.html', level: 'Supports', remarks: 'All interactive elements are accessible via keyboard tab sequence. Custom widgets use Headless UI for proper keyboard handling.' },
  { criteria: '2.1.2 No Keyboard Trap', url: 'https://www.w3.org/WAI/WCAG21/Understanding/no-keyboard-trap.html', level: 'Supports', remarks: 'Focus is not trapped in any component. Modal dialogs properly manage focus and allow exit via Escape key.' },
  { criteria: '2.1.4 Character Key Shortcuts', url: 'https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html', level: 'Not Applicable', remarks: 'The application does not implement character key shortcuts.' },
  { criteria: '2.2.1 Timing Adjustable', url: 'https://www.w3.org/WAI/WCAG21/Understanding/timing-adjustable.html', level: 'Supports', remarks: 'The application does not impose time limits on user interactions.' },
  { criteria: '2.2.2 Pause, Stop, Hide', url: 'https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html', level: 'Not Applicable', remarks: 'The application does not contain moving, blinking, scrolling, or auto-updating content.' },
  { criteria: '2.3.1 Three Flashes or Below Threshold', url: 'https://www.w3.org/WAI/WCAG21/Understanding/three-flashes-or-below-threshold.html', level: 'Supports', remarks: 'The application does not contain content that flashes more than three times per second.' },
  { criteria: '2.4.1 Bypass Blocks', url: 'https://www.w3.org/WAI/WCAG21/Understanding/bypass-blocks.html', level: 'Supports', remarks: 'A "Skip to main content" link is present in the PageShell component, targeting #main-content on the main element.' },
  { criteria: '2.4.2 Page Titled', url: 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html', level: 'Supports', remarks: 'Each page has a descriptive title set via Next.js metadata.' },
  { criteria: '2.4.3 Focus Order', url: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html', level: 'Supports', remarks: 'Focus order follows a logical sequence that preserves meaning and operability.' },
  { criteria: '2.4.4 Link Purpose (In Context)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html', level: 'Supports', remarks: 'Link text is descriptive or can be determined from context. Course links include course codes and titles.' },
  { criteria: '2.5.1 Pointer Gestures', url: 'https://www.w3.org/WAI/WCAG21/Understanding/pointer-gestures.html', level: 'Supports', remarks: 'All functionality that uses multipoint or path-based gestures can be operated with a single pointer.' },
  { criteria: '2.5.2 Pointer Cancellation', url: 'https://www.w3.org/WAI/WCAG21/Understanding/pointer-cancellation.html', level: 'Supports', remarks: 'Click/tap events use the up-event pattern by default in React.' },
  { criteria: '2.5.3 Label in Name', url: 'https://www.w3.org/WAI/WCAG21/Understanding/label-in-name.html', level: 'Supports', remarks: 'Visible labels match accessible names for form controls and buttons.' },
  { criteria: '2.5.4 Motion Actuation', url: 'https://www.w3.org/WAI/WCAG21/Understanding/motion-actuation.html', level: 'Not Applicable', remarks: 'The application does not use device motion for functionality.' },
  { criteria: '3.1.1 Language of Page', url: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html', level: 'Supports', remarks: 'The HTML lang attribute is set to "en" in the Next.js layout.' },
  { criteria: '3.2.1 On Focus', url: 'https://www.w3.org/WAI/WCAG21/Understanding/on-focus.html', level: 'Supports', remarks: 'Receiving focus does not trigger unexpected changes of context.' },
  { criteria: '3.2.2 On Input', url: 'https://www.w3.org/WAI/WCAG21/Understanding/on-input.html', level: 'Supports', remarks: 'Changing form control values does not trigger unexpected changes of context.' },
  { criteria: '3.3.1 Error Identification', url: 'https://www.w3.org/WAI/WCAG21/Understanding/error-identification.html', level: 'Supports', remarks: 'Form validation errors are displayed with clear error messages and visual indicators.' },
  { criteria: '3.3.2 Labels or Instructions', url: 'https://www.w3.org/WAI/WCAG21/Understanding/labels-or-instructions.html', level: 'Supports', remarks: 'Form fields have visible labels and placeholder text providing guidance.' },
  { criteria: '4.1.1 Parsing', url: 'https://www.w3.org/WAI/WCAG21/Understanding/parsing.html', level: 'Supports', remarks: 'HTML is validated and contains no duplicate IDs or improper nesting.' },
  { criteria: '4.1.2 Name, Role, Value', url: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html', level: 'Supports', remarks: 'Custom widgets are implemented using Headless UI which manages ARIA states and focus programmatically.' },
];

// ===========================================
// WCAG Level AA Criteria Data
// ===========================================

const wcagLevelAAData: CriteriaRow[] = [
  { criteria: '1.2.4 Captions (Live)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/captions-live.html', level: 'Not Applicable', remarks: 'The application does not contain live synchronized media.' },
  { criteria: '1.2.5 Audio Description (Prerecorded)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/audio-description-prerecorded.html', level: 'Not Applicable', remarks: 'The application does not contain prerecorded synchronized media.' },
  { criteria: '1.3.4 Orientation', url: 'https://www.w3.org/WAI/WCAG21/Understanding/orientation.html', level: 'Supports', remarks: 'Content displays correctly in both portrait and landscape orientations.' },
  { criteria: '1.3.5 Identify Input Purpose', url: 'https://www.w3.org/WAI/WCAG21/Understanding/identify-input-purpose.html', level: 'Supports', remarks: 'Form inputs use appropriate autocomplete attributes where applicable.' },
  { criteria: '1.4.3 Contrast (Minimum)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html', level: 'Supports', remarks: 'All text meets the 4.5:1 contrast ratio requirement. Primary content uses text-slate-900/dark:text-white. Secondary text uses text-slate-600/dark:text-slate-400.' },
  { criteria: '1.4.4 Resize Text', url: 'https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html', level: 'Supports', remarks: 'Text can be resized up to 200% without loss of content or functionality. Uses relative units (rem).' },
  { criteria: '1.4.5 Images of Text', url: 'https://www.w3.org/WAI/WCAG21/Understanding/images-of-text.html', level: 'Supports', remarks: 'The application does not use images of text. All text is rendered as HTML.' },
  { criteria: '1.4.10 Reflow', url: 'https://www.w3.org/WAI/WCAG21/Understanding/reflow.html', level: 'Supports', remarks: 'The application is built with responsive CSS that adapts to 320px width without horizontal scrolling.' },
  { criteria: '1.4.11 Non-text Contrast', url: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-contrast.html', level: 'Supports', remarks: 'UI components maintain at least 3:1 contrast against adjacent colors.' },
  { criteria: '1.4.12 Text Spacing', url: 'https://www.w3.org/WAI/WCAG21/Understanding/text-spacing.html', level: 'Supports', remarks: 'Content can be displayed with increased text spacing without loss of functionality.' },
  { criteria: '1.4.13 Content on Hover or Focus', url: 'https://www.w3.org/WAI/WCAG21/Understanding/content-on-hover-or-focus.html', level: 'Supports', remarks: 'Tooltip content can be dismissed via Escape key and remains visible while hovered.' },
  { criteria: '2.4.5 Multiple Ways', url: 'https://www.w3.org/WAI/WCAG21/Understanding/multiple-ways.html', level: 'Supports', remarks: 'Users can navigate via sidebar menu, direct URL access, and search functionality.' },
  { criteria: '2.4.6 Headings and Labels', url: 'https://www.w3.org/WAI/WCAG21/Understanding/headings-and-labels.html', level: 'Supports', remarks: 'Headings describe topic or purpose. Form labels describe input purposes.' },
  { criteria: '2.4.7 Focus Visible', url: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-visible.html', level: 'Supports', remarks: 'Interactive elements use visible focus indicators via focus-visible:ring-2.' },
  { criteria: '3.1.2 Language of Parts', url: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-parts.html', level: 'Supports', remarks: 'Content is in English throughout; no mixed-language content.' },
  { criteria: '3.2.3 Consistent Navigation', url: 'https://www.w3.org/WAI/WCAG21/Understanding/consistent-navigation.html', level: 'Supports', remarks: 'Navigation patterns are consistent across pages.' },
  { criteria: '3.2.4 Consistent Identification', url: 'https://www.w3.org/WAI/WCAG21/Understanding/consistent-identification.html', level: 'Supports', remarks: 'Components with the same functionality have consistent labels.' },
  { criteria: '3.3.3 Error Suggestion', url: 'https://www.w3.org/WAI/WCAG21/Understanding/error-suggestion.html', level: 'Supports', remarks: 'Form validation provides specific suggestions for correcting errors.' },
  { criteria: '3.3.4 Error Prevention (Legal, Financial, Data)', url: 'https://www.w3.org/WAI/WCAG21/Understanding/error-prevention-legal-financial-data.html', level: 'Supports', remarks: 'Course submissions include confirmation dialogs. Data deletion requires confirmation.' },
  { criteria: '4.1.3 Status Messages', url: 'https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html', level: 'Supports', remarks: 'Status messages use appropriate ARIA live regions.' },
];

// ===========================================
// Functional Performance Criteria Data
// ===========================================

const fpcData: Section508Row[] = [
  { criteria: '302.1 Without Vision', url: 'https://www.access-board.gov/ict/#302.1', level: 'Supports', remarks: 'All content and functionality is accessible to screen reader users. Semantic HTML, ARIA labels, and proper focus management ensure operability without vision.' },
  { criteria: '302.2 With Limited Vision', url: 'https://www.access-board.gov/ict/#302.2', level: 'Supports', remarks: 'Text meets contrast requirements and can be resized up to 200%. The application supports browser zoom and OS-level magnification.' },
  { criteria: '302.3 Without Perception of Color', url: 'https://www.access-board.gov/ict/#302.3', level: 'Supports', remarks: 'Color is not the sole means of conveying information. Status indicators use both color and text labels.' },
  { criteria: '302.4 Without Hearing', url: 'https://www.access-board.gov/ict/#302.4', level: 'Supports', remarks: 'The application does not rely on audio for conveying information.' },
  { criteria: '302.5 With Limited Hearing', url: 'https://www.access-board.gov/ict/#302.5', level: 'Not Applicable', remarks: 'The application does not contain audio content.' },
  { criteria: '302.6 Without Speech', url: 'https://www.access-board.gov/ict/#302.6', level: 'Supports', remarks: 'The application does not require speech input for operation.' },
  { criteria: '302.7 With Limited Manipulation', url: 'https://www.access-board.gov/ict/#302.7', level: 'Supports', remarks: 'All functionality is operable via keyboard. No fine motor control is required.' },
  { criteria: '302.8 With Limited Reach and Strength', url: 'https://www.access-board.gov/ict/#302.8', level: 'Supports', remarks: 'The application requires only standard keyboard and mouse input.' },
  { criteria: '302.9 With Limited Language, Cognitive, and Learning Abilities', url: 'https://www.access-board.gov/ict/#302.9', level: 'Supports', remarks: 'The interface uses clear, consistent navigation and provides helpful error messages.' },
];

// ===========================================
// Chapter 4: Hardware Data
// ===========================================

const hardwareData: Section508Row[] = [
  { criteria: '402 Closed Functionality', url: 'https://www.access-board.gov/ict/#402', level: 'Not Applicable', remarks: 'Calricula is a web application, not closed-functionality hardware.' },
  { criteria: '403 Biometrics', url: 'https://www.access-board.gov/ict/#403', level: 'Not Applicable', remarks: 'The application does not use biometric identification.' },
  { criteria: '404 Preservation of Information', url: 'https://www.access-board.gov/ict/#404', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '405 Privacy', url: 'https://www.access-board.gov/ict/#405', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '406 Standard Connections', url: 'https://www.access-board.gov/ict/#406', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '407 Operable Parts', url: 'https://www.access-board.gov/ict/#407', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '408 Display Screens', url: 'https://www.access-board.gov/ict/#408', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '409 Status Indicators', url: 'https://www.access-board.gov/ict/#409', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '410 Color Coding', url: 'https://www.access-board.gov/ict/#410', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '411 Audible Signals', url: 'https://www.access-board.gov/ict/#411', level: 'Not Applicable', remarks: 'Not applicable to web applications.' },
  { criteria: '412 ICT with Two-Way Voice Communication', url: 'https://www.access-board.gov/ict/#412', level: 'Not Applicable', remarks: 'The application does not include voice communication.' },
  { criteria: '413 ICT with Video Capabilities', url: 'https://www.access-board.gov/ict/#413', level: 'Not Applicable', remarks: 'The application does not include video playback.' },
  { criteria: '414 Audio Description Processing', url: 'https://www.access-board.gov/ict/#414', level: 'Not Applicable', remarks: 'The application does not process audio description content.' },
];

// ===========================================
// Chapter 5: Software Data
// ===========================================

const softwareData: Section508Row[] = [
  { criteria: '501.1 Scope – Incorporation of WCAG 2.0 AA', url: 'https://www.access-board.gov/ict/#501.1', level: 'See WCAG 2.x section', remarks: 'Web content conformance is addressed in the WCAG tables above.' },
  { criteria: '502 Interoperability with Assistive Technology', url: 'https://www.access-board.gov/ict/#502', level: 'Supports', remarks: 'The application uses standard web technologies that work with assistive technologies. Headless UI components ensure proper AT interoperability.' },
  { criteria: '503 Applications', url: 'https://www.access-board.gov/ict/#503', level: 'Supports', remarks: 'The web application provides equivalent functionality to all users.' },
  { criteria: '504 Authoring Tools', url: 'https://www.access-board.gov/ict/#504', level: 'Partially Supports', remarks: 'The course editor allows creation of accessible content. However, it does not enforce accessibility of user-generated content.' },
];

// ===========================================
// Chapter 6: Support Documentation Data
// ===========================================

const supportDocsData: Section508Row[] = [
  { criteria: '602.2 Accessibility and Compatibility Features', url: 'https://www.access-board.gov/ict/#602.2', level: 'Supports', remarks: 'Documentation describing accessibility features is provided in the Help section and this ACR.' },
  { criteria: '602.3 Electronic Support Documentation', url: 'https://www.access-board.gov/ict/#602.3', level: 'Supports', remarks: 'Help documentation is provided as accessible HTML within the application.' },
  { criteria: '602.4 Alternate Formats for Non-Electronic Docs', url: 'https://www.access-board.gov/ict/#602.4', level: 'Not Applicable', remarks: 'All documentation is provided electronically in accessible formats.' },
  { criteria: '603.2 Information on Accessibility Features', url: 'https://www.access-board.gov/ict/#603.2', level: 'Supports', remarks: 'Support services can provide information about accessibility features. Contact accessibility@calricula.com.' },
  { criteria: '603.3 Accommodation of Communication Needs', url: 'https://www.access-board.gov/ict/#603.3', level: 'Supports', remarks: 'Support is available via email, accommodating users who cannot use voice communication.' },
];

// ===========================================
// Main Page Component
// ===========================================

export default function Section508ACRPage() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <Link
              href="/"
              className="flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-luminous-600 dark:hover:text-luminous-400 transition-colors"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              <span className="text-sm font-medium">Back to Home</span>
            </Link>
            <div className="flex items-center gap-2">
              <AcademicCapIcon className="h-7 w-7 text-luminous-600" />
              <span className="text-lg font-bold text-slate-900 dark:text-white">Calricula</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="main-content" className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Title Section */}
        <div className="mb-12">
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
            Calricula Accessibility Conformance Report
          </h1>
          <p className="text-lg text-luminous-600 dark:text-luminous-400 font-medium mb-4">
            Revised Section 508 Edition
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
            Based on{' '}
            <a
              href="https://www.itic.org/policy/accessibility/vpat"
              target="_blank"
              rel="noopener noreferrer"
              className="text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 underline"
            >
              VPAT Version 2.5 Rev
            </a>
          </p>
          <a
            href="/docs/ACR_Calricula_v1.0_508.docx"
            download
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-luminous-600 hover:bg-luminous-700 text-white font-medium text-sm transition-colors"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Download Word Document
          </a>
        </div>

        {/* Product Information */}
        <section className="mb-12" aria-labelledby="product-info">
          <h2 id="product-info" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Product Information
          </h2>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
            <dl className="divide-y divide-slate-200 dark:divide-slate-700">
              <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-900 dark:text-white">Name of Product/Version</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300 sm:mt-0 sm:col-span-2">Calricula v1.0</dd>
              </div>
              <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-900 dark:text-white">Report Date</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300 sm:mt-0 sm:col-span-2">December 20, 2025</dd>
              </div>
              <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-900 dark:text-white">Product Description</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300 sm:mt-0 sm:col-span-2">
                  Calricula is an AI-assisted Curriculum Management System for educational institutions. It is a web-based application that allows faculty to create, modify, and approve Course Outlines of Record (CORs) and Programs. Features include AI-assisted authoring, compliance checking against state regulations (PCAH/Title 5), and an approval workflow dashboard.
                </dd>
              </div>
              <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-900 dark:text-white">Contact Information</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300 sm:mt-0 sm:col-span-2">
                  <a href="mailto:accessibility@calricula.com" className="text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 underline">
                    accessibility@calricula.com
                  </a>
                </dd>
              </div>
              <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-900 dark:text-white">Notes</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300 sm:mt-0 sm:col-span-2">
                  This report covers the web-based faculty interface accessed via modern web browsers (Chrome, Firefox, Safari, Edge).
                </dd>
              </div>
              <div className="px-6 py-4 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-slate-900 dark:text-white">Evaluation Methods</dt>
                <dd className="mt-1 text-sm text-slate-700 dark:text-slate-300 sm:mt-0 sm:col-span-2">
                  Automated testing via axe-core, manual code review of React components, keyboard-only navigation testing, and visual inspection of color contrast ratios.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Applicable Standards */}
        <section className="mb-12" aria-labelledby="standards">
          <h2 id="standards" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Applicable Standards/Guidelines
          </h2>
          <SimpleTable
            title=""
            headers={['Standard/Guideline', 'Included in Report']}
            rows={[
              ['Web Content Accessibility Guidelines 2.0', 'Level A (Yes), Level AA (Yes), Level AAA (No)'],
              ['Web Content Accessibility Guidelines 2.1', 'Level A (Yes), Level AA (Yes), Level AAA (No)'],
              ['Revised Section 508 (January 18, 2017)', 'Yes'],
            ]}
          />
        </section>

        {/* Terms */}
        <section className="mb-12" aria-labelledby="terms">
          <h2 id="terms" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Terms
          </h2>
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
            <dl className="space-y-4">
              <div>
                <dt className="font-semibold text-slate-900 dark:text-white">Supports</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-300 mt-1">The functionality of the product has at least one method that meets the criterion without known defects or meets with equivalent facilitation.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900 dark:text-white">Partially Supports</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-300 mt-1">Some functionality of the product does not meet the criterion.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900 dark:text-white">Does Not Support</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-300 mt-1">The majority of product functionality does not meet the criterion.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900 dark:text-white">Not Applicable</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-300 mt-1">The criterion is not relevant to the product.</dd>
              </div>
              <div>
                <dt className="font-semibold text-slate-900 dark:text-white">Not Evaluated</dt>
                <dd className="text-sm text-slate-700 dark:text-slate-300 mt-1">The product has not been evaluated against the criterion (WCAG 2.x Level AAA only).</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* WCAG 2.x Report */}
        <section className="mb-12" aria-labelledby="wcag-report">
          <h2 id="wcag-report" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            WCAG 2.x Report
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 mb-6">
            Tables 1 and 2 also document conformance with{' '}
            <a
              href="https://www.access-board.gov/ict/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 underline"
            >
              Revised Section 508
            </a>
            : Chapter 5 - 501.1 Scope, 504.2 Content Creation or Editing; Chapter 6 - 602.3 Electronic Support Documentation.
          </p>

          <WCAGTable
            title="Table 1: Success Criteria, Level A"
            rows={wcagLevelAData}
          />

          <WCAGTable
            title="Table 2: Success Criteria, Level AA"
            rows={wcagLevelAAData}
          />

          <div className="mb-8">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">Table 3: Success Criteria, Level AAA</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              WCAG 2.x Level AAA criteria are not evaluated as part of this report. Level AAA conformance is not required for Section 508 compliance.
            </p>
          </div>
        </section>

        {/* Revised Section 508 Report */}
        <section className="mb-12" aria-labelledby="section508-report">
          <h2 id="section508-report" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            <a
              href="https://www.access-board.gov/ict/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-luminous-600 dark:hover:text-luminous-400"
            >
              Revised Section 508 Report
            </a>
          </h2>

          <Section508Table
            title="Chapter 3: Functional Performance Criteria"
            rows={fpcData}
          />

          <Section508Table
            title="Chapter 4: Hardware"
            rows={hardwareData}
            caption="Calricula is a web application and hardware criteria are not applicable."
          />

          <Section508Table
            title="Chapter 5: Software"
            rows={softwareData}
          />

          <Section508Table
            title="Chapter 6: Support Documentation and Services"
            rows={supportDocsData}
          />
        </section>

        {/* Legal Disclaimer */}
        <section className="mb-12" aria-labelledby="disclaimer">
          <h2 id="disclaimer" className="text-2xl font-bold text-slate-900 dark:text-white mb-6">
            Legal Disclaimer
          </h2>
          <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-6">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              This document is provided for informational purposes regarding the accessibility of Calricula. This is not a certification of accessibility, but rather a self-assessment based on the evaluation methods described above. Accessibility is an ongoing effort, and this report represents the status as of the report date. For questions or to report accessibility issues, please contact{' '}
              <a href="mailto:accessibility@calricula.com" className="text-luminous-600 hover:text-luminous-700 dark:text-luminous-400 dark:hover:text-luminous-300 underline">
                accessibility@calricula.com
              </a>.
            </p>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-200 dark:border-slate-700 pt-8">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Report prepared by: Calricula Development Team
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Report Date: December 20, 2025
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Based on VPAT Version: 2.5 Rev Section 508
          </p>
        </footer>
      </main>
    </div>
  );
}
