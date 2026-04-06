from pathlib import Path
text = Path('css/dashboard.css').read_text()
old = " .account-meta {\n  display: flex;\n  align-items: center;\n  gap: 0.6rem;\n}\n\n.account-chip,\n.status-chip {\n  padding: 0.25rem 0.7rem;\n  border-radius: 999px;\n  font-size: 0.75rem;\n  font-weight: 600;\n  letter-spacing: 0.04em;\n}\n\n.account-chip {\n  background: rgba(59, 130, 246, 0.2);\n  color: #60a5fa;\n}\n\n.status-chip.running {\n  background: rgba(59, 130, 246, 0.2);\n  color: #60a5fa;\n}\n\n.status-chip.completed {\n  background: rgba(16, 185, 129, 0.2);\n  color: #34d399;\n}\n\n.status-chip.failed {\n  background: rgba(248, 113, 113, 0.2);\n  color: #f87171;\n}\n\n"
if old not in text:
    raise SystemExit('old chunk missing')
text = text.replace(old, '', 1)
insert = "
.account-card__content {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.account-card__header {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: flex-start;
}

.account-card__info {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.85rem;
  color: rgba(226, 232, 240, 0.7);
}

.provider-label {
  margin: 0;
  font-size: 0.85rem;
  color: rgba(148, 163, 184, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.actions {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.actions .btn {
  width: 100%;
}

.actions .btn.secondary {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(148, 163, 184, 0.5);
}

.actions .btn:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

"
text = text.replace('.account-card__content {\n  display: flex;\n  flex-direction: column;\n  gap: 0.75rem;\n}\n\n.account-card__header {\n  display: flex;\n  justify-content: space-between;\n  gap: 0.75rem;\n  align-items: flex-start;\n}\n\n.account-card__info {\n  display: flex;\n  flex-wrap: wrap;\n  gap: 0.75rem;\n  font-size: 0.85rem;\n  color: rgba(226, 232, 240, 0.7);\n}\n\n.last-scan-label,\n.region-label {\n  margin: 0;\n}\n\n.region-label {\n  color: rgba(148, 163, 184, 0.7);\n}\n\n.recent-scans-section {\n  display: flex;\n  flex-direction: column;\n  gap: 0.35rem;\n}\n\n.section-label {\n  margin: 0;\n  font-size: 0.7rem;\n  letter-spacing: 0.1em;\n  text-transform: uppercase;\n  color: rgba(148, 163, 184, 0.8);\n}\n\n.connection-error__message {\n  display: block;\n  margin-top: 0.25rem;\n  color: inherit;\n}\n\n', insert, 1)
Path('css/dashboard.css').write_text(text)
Path('modify_css.py').unlink()
