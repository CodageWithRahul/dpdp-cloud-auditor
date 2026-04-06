from pathlib import Path
for i,line in enumerate(Path('frontend/js/accounts.js').read_text().splitlines(),1):
    if 120 <= i <= 200:
        print(f"{i}: {line}")
