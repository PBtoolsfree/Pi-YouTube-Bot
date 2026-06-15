import ast

def extract_methods(filepath, method_names):
    # Try different encodings due to potential Windows BOM
    content = None
    for enc in ['utf-8', 'utf-16', 'utf-16-le', 'utf-16-be']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                content = f.read()
            break
        except UnicodeError:
            continue
    
    if not content:
        print("Failed to read file with any encoding")
        return
        
    # Split lines to extract exact source code ranges
    lines = content.splitlines()
    tree = ast.parse(content)
    
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if node.name in method_names:
                print(f"=== METHOD: {node.name} ===")
                # ast lines are 1-indexed. end_lineno is inclusive in python 3.8+
                method_lines = lines[node.lineno-1 : node.end_lineno]
                print("\n".join(method_lines))
                print("===================================\n")

extract_methods('old_bot_service.py', ['_auto_message_loop', '_monitor_loop', '_process_reward'])
