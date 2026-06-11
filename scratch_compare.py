import ast
import sys

def get_structure(filepath):
    # Try different encodings due to potential Windows BOM
    for enc in ['utf-8', 'utf-16', 'utf-16-le', 'utf-16-be']:
        try:
            with open(filepath, 'r', encoding=enc) as f:
                content = f.read()
            tree = ast.parse(content)
            methods = []
            for node in ast.walk(tree):
                if isinstance(node, ast.ClassDef):
                    methods.append(('class', node.name))
                elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    methods.append(('def', node.name))
            return methods
        except UnicodeError:
            continue
        except Exception as e:
            print(f'Error parsing {filepath} with {enc}: {e}')
            return []
    print(f'Failed to parse {filepath} with any encoding')
    return []

old_struct = get_structure('old_bot_service.py')
new_struct = get_structure('backend/bot_service.py')

print(f'Old Bot Service items: {len(old_struct)}')
print(f'New Bot Service items: {len(new_struct)}')

old_names = set(x[1] for x in old_struct)
new_names = set(x[1] for x in new_struct)

missing = old_names - new_names
print('Missing in new bot service:', sorted(list(missing)))
