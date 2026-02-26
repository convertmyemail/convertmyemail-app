export default function HowToSaveEml() {
  const cards = [
    {
      title: "Gmail (Web)",
      steps: [
        "Open the email in Gmail.",
        "Click the three dots (⋮) in the top-right of the message.",
        "Click “Download message”.",
        "You’ll get a .eml file — upload it here to convert.",
      ],
      tip: "Tip: If the file ends in .eml, you’re good — no renaming needed.",
    },
    {
      title: "Outlook (Desktop)",
      steps: [
        "Open the email in Outlook.",
        "Drag the email from Outlook onto your Desktop (or a folder).",
        "Outlook saves it as an .eml file.",
        "Upload the .eml file here to convert.",
      ],
      tip: "Works best in classic Outlook desktop on Windows/Mac.",
    },
    {
      title: "Outlook (Web / Microsoft 365)",
      steps: [
        "Open the message in Outlook on the web.",
        "Click … (More actions).",
        "If you see “Download”, use it to save the .eml.",
        "If you don’t: open the email in desktop Outlook and drag it out as .eml.",
      ],
      tip: "Web Outlook varies by tenant — desktop is the reliable fallback.",
    },
  ];

  return (
    <section className="mx-auto w-full max-w-6xl px-6 py-14">
      <div className="mb-8">
        <h2 className="text-2xl font-semibold tracking-tight">How to save an .eml file</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-600">
          Save the email as a <span className="font-medium text-gray-900">.eml</span> file, then upload it to Convert My Email.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.title}
            className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900">{card.title}</h3>
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-600">
                1–2 min
              </span>
            </div>

            <ol className="space-y-3 text-sm text-gray-700">
              {card.steps.map((s, i) => (
                <li key={i} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-50 text-[11px] text-gray-700">
                    {i + 1}
                  </span>
                  <span className="leading-6">{s}</span>
                </li>
              ))}
            </ol>

            <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              {card.tip}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <div className="text-sm text-gray-700">
          <span className="font-semibold text-gray-900">Bonus:</span> If your .eml contains a whole thread, Convert My Email will automatically split it into multiple messages.
        </div>
      </div>
    </section>
  );
}