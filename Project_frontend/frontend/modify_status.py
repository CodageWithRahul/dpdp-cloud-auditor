from pathlib import Path 
 
path = Path('js/dashboard.js') 
text = path.read_text() 
 
old = '''const statusLabel = (status) =
  if (!status) return 'Idle'; 
  const normalized = status.toString().toLowerCase(); 
  if (normalized.includes('running') || normalized.includes('pending')) return 'Running'; 
  if (normalized.includes('fail') || normalized.includes('error')) return 'Failed'; 
  return 'Completed'; 
}; 
 
const statusClass = (label) =
  const normalized = label.toLowerCase(); 
  if (normalized.includes('running')) return 'running'; 
  if (normalized.includes('failed')) return 'failed'; 
  return 'completed'; 
}; 
 
new = '''const statusLabel = (status) =
