from pathlib import Path 
 
path = Path('frontend/js/accounts.js') 
text = path.read_text() 
 
marker = 'const statusBadge = (status) =
start = text.index(marker) 
 
def find_block_end(buffer, position): 
    depth = 0 
    for index in range(position, len(buffer)): 
        char = buffer[index] 
        if char == '{': 
            depth += 1 
        elif char == '}': 
            depth -= 1 
            if depth == 0: 
                return index + 1 
    raise SystemExit('unable to locate block end') 
 
