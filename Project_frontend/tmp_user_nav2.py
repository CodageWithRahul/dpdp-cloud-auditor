from pathlib import Path
path = Path('frontend/pages/user_details.html')
text = path.read_text(encoding='utf-8')
old = "      <ul class=\"nav-list\">\n        <li><a href=\"dashboard.html\">Dashboard</a></li>\n        <li><a href=\"cloud_accounts.html\">Cloud Accounts</a></li>\n        <li><a class=\"active\" href=\"scan_history.html\">Scan History</a></li>\n        <li><a class=\"active\" href=\"user_details.html\">User Details</a></li>\n      </ul>"
new = "      <ul class=\"nav-list\">\n        <li><a href=\"dashboard.html\">Dashboard</a></li>\n        <li><a href=\"cloud_accounts.html\">Cloud Accounts</a></li>\n        <li><a href=\"scan_history.html\">Scan History</a></li>\n        <li><a class=\"active\" href=\"user_details.html\">User Details</a></li>\n      </ul>"
if old not in text:
    raise SystemExit('pattern not found')
path.write_text(text.replace(old, new, 1), encoding='utf-8')
