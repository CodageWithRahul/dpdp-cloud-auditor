from pathlib import Path
path = Path('pages/dashboard.html')
text = path.read_text()
old = """    <header class=\"top-nav\">
      <div class=\"brand-group\">
        <div>
          <p class=\"eyebrow\">Security Console</p>
          <h1>Cloud Auditor</h1>
        </div>
        <nav class=\"primary-nav\">
          <a class=\"nav-link active\" href=\"dashboard.html\">Dashboard</a>
          <a class=\"nav-link\" href=\"cloud_accounts.html\">Cloud Accounts</a>
          <a class=\"nav-link\" href=\"report.html\">Reports</a>
        </nav>
      </div>
      <div class=\"nav-user\">
"""
new = """    <header class=\"top-nav\">
      <div class=\"brand-logo\">
        <p class=\"eyebrow\">Security Console</p>
        <h1>Cloud Auditor</h1>
      </div>
      <nav class=\"primary-nav\">
        <a class=\"nav-link active\" href=\"dashboard.html\">Dashboard</a>
        <a class=\"nav-link\" href=\"cloud_accounts.html\">Cloud Accounts</a>
        <a class=\"nav-link\" href=\"scan_history.html\">Scan History</a>
        <a class=\"nav-link\" href=\"report.html\">Reports</a>
      </nav>
      <div class=\"nav-user\">
"""
if old not in text:
    raise SystemExit('pattern not found')
text = text.replace(old, new, 1)
path.write_text(text)
