// The Python side of the runner, as source text. Pyodide runs it once after loading, and
// scripts/validate-challenges.mjs runs the same text with python3, so the browser and the
// validator agree on conversions, error reports and results.
//
// Entry points (called with an `emit(kind, payload)` callback):
//   run_script(code, emit)
//       Runs a program. Output streams through emit('out' | 'err', text). An uncaught error
//       is reported with emit('error', json).
//   run_tests(code, fn_name, tests_json, arg_types_json, return_type, emit) -> json
//       tests_json is a JSON list of JSON strings (one argument list per test).
//       Emits 'test-start' (index) and 'test-result' (json) per test, or 'fatal' (json) when
//       the code does not load or the function is missing. Returns json { stdout } with
//       anything printed while the code loaded.
//   check_syntax(code) -> json error or ''
// Errors are { message, line, trace } with line numbers relative to the learner's code.

export const PYTHON_FILENAME = 'solution.py'

export const PYTHON_HARNESS = String.raw`
import builtins
import contextlib
import io
import json
import time
import traceback

FILENAME = 'solution.py'
TEST_OUTPUT_LIMIT = 10000


class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next

    def __repr__(self):
        parts = []
        seen = set()
        node = self
        while node is not None and len(parts) < 50:
            if id(node) in seen:
                parts.append('(cycle)')
                return 'ListNode(' + ' -> '.join(parts) + ')'
            seen.add(id(node))
            parts.append(repr(getattr(node, 'val', None)))
            node = getattr(node, 'next', None)
        if node is not None:
            parts.append('...')
        return 'ListNode(' + ' -> '.join(parts) + ')'


class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right

    def __repr__(self):
        try:
            return 'TreeNode(' + repr(_from_tree(self)) + ')'
        except Exception:
            return 'TreeNode(' + repr(self.val) + ', ...)'


class _ResultError(Exception):
    pass


def _to_list(values):
    if not isinstance(values, list):
        return values
    head = None
    for value in reversed(values):
        head = ListNode(value, head)
    return head


def _to_tree(values):
    if not isinstance(values, list) or not values or values[0] is None:
        return None
    root = TreeNode(values[0])
    queue = [root]
    head = 0
    i = 1
    while head < len(queue) and i < len(values):
        node = queue[head]
        head += 1
        if i < len(values) and values[i] is not None:
            node.left = TreeNode(values[i])
            queue.append(node.left)
        i += 1
        if i < len(values) and values[i] is not None:
            node.right = TreeNode(values[i])
            queue.append(node.right)
        i += 1
    return root


def _short(value):
    text = repr(value)
    return text if len(text) <= 80 else text[:77] + '...'


def _from_list(head):
    if head is None:
        return []
    if not hasattr(head, 'val') or not hasattr(head, 'next'):
        raise _ResultError('Expected the head node of a linked list (a ListNode or None), but got ' + _short(head) + '.')
    out = []
    seen = set()
    node = head
    while node is not None:
        if id(node) in seen:
            raise _ResultError('Your linked list has a cycle: a node points back to an earlier node.')
        seen.add(id(node))
        out.append(_plain(node.val))
        node = node.next
        if len(out) > 100000:
            raise _ResultError('Your linked list is longer than 100,000 nodes. Is a pointer wired wrong?')
    return out


def _from_tree(root):
    if root is None:
        return []
    if not hasattr(root, 'val') or not hasattr(root, 'left'):
        raise _ResultError('Expected the root node of a tree (a TreeNode or None), but got ' + _short(root) + '.')
    out = []
    queue = [root]
    seen = set()
    i = 0
    while i < len(queue):
        node = queue[i]
        i += 1
        if node is None:
            out.append(None)
            continue
        if id(node) in seen:
            raise _ResultError('Your tree has a cycle: a node points back to an ancestor.')
        seen.add(id(node))
        out.append(_plain(node.val))
        queue.append(getattr(node, 'left', None))
        queue.append(getattr(node, 'right', None))
        if len(queue) > 200000:
            raise _ResultError('Your tree has more than 100,000 nodes. Is a pointer wired wrong?')
    while out and out[-1] is None:
        out.pop()
    return out


def _plain(value, depth=0):
    if value is None or isinstance(value, (bool, str, int)):
        return value
    if isinstance(value, float):
        if value != value:
            return 'nan'
        if value in (float('inf'), float('-inf')):
            return 'inf' if value > 0 else '-inf'
        return value
    if depth > 64:
        return '...'
    if isinstance(value, (list, tuple)):
        return [_plain(v, depth + 1) for v in value]
    if isinstance(value, (set, frozenset)):
        items = [_plain(v, depth + 1) for v in value]
        try:
            items.sort()
        except TypeError:
            pass
        return items
    if isinstance(value, dict):
        out = {}
        for k, v in value.items():
            if isinstance(k, str):
                key = k
            elif isinstance(k, bool):
                key = 'true' if k else 'false'
            elif k is None:
                key = 'null'
            elif isinstance(k, (int, float)):
                key = json.dumps(k)
            else:
                key = repr(k)
            out[key] = _plain(v, depth + 1)
        return out
    return repr(value)


def _convert_arg(value, kind):
    if kind == 'list':
        return _to_list(value)
    if kind == 'tree':
        return _to_tree(value)
    if kind == 'list[]' and isinstance(value, list):
        return [_to_list(v) for v in value]
    if kind == 'tree[]' and isinstance(value, list):
        return [_to_tree(v) for v in value]
    return value


def _convert_result(value, kind):
    if kind == 'list':
        return _from_list(value)
    if kind == 'tree':
        return _from_tree(value)
    if kind in ('list[]', 'tree[]'):
        if not isinstance(value, (list, tuple)):
            raise _ResultError('Expected a list of ' + ('linked lists.' if kind == 'list[]' else 'trees.'))
        return [(_from_list if kind == 'list[]' else _from_tree)(v) for v in value]
    return _plain(value)


def _error_info(exc):
    if isinstance(exc, _ResultError):
        return {'message': str(exc), 'line': None, 'trace': []}
    frames = [f for f in traceback.extract_tb(exc.__traceback__) if f.filename == FILENAME]
    if isinstance(exc, SyntaxError) and exc.filename == FILENAME:
        message = type(exc).__name__ + ': ' + str(exc.msg)
        return {'message': message, 'line': exc.lineno, 'trace': []}
    message = ''.join(traceback.format_exception_only(type(exc), exc)).strip()
    frames.reverse()
    trace = ['line ' + str(f.lineno) + ('' if f.name == '<module>' else ', in ' + f.name) for f in frames[:8]]
    return {'message': message, 'line': frames[0].lineno if frames else None, 'trace': trace}


def _no_input(prompt=''):
    raise RuntimeError('input() is not available here. Put the values in variables instead.')


def _namespace():
    ns = {'__name__': '__main__', '__builtins__': builtins, 'ListNode': ListNode, 'TreeNode': TreeNode, 'input': _no_input}
    try:
        exec('from typing import *', ns)
    except Exception:
        pass
    return ns


def _load(code, ns):
    try:
        compiled = compile(code, FILENAME, 'exec')
    except SyntaxError as exc:
        return _error_info(exc)
    except (ValueError, OverflowError) as exc:
        return {'message': type(exc).__name__ + ': ' + str(exc), 'line': None, 'trace': []}
    try:
        exec(compiled, ns)
    except SystemExit as exc:
        if exc.code in (None, 0):
            return None
        return _error_info(exc)
    except Exception as exc:
        return _error_info(exc)
    return None


class _Stream(io.TextIOBase):
    def __init__(self, name, emit):
        self._name = name
        self._emit = emit

    def writable(self):
        return True

    def write(self, text):
        if text:
            self._emit(self._name, str(text))
        return len(text)


class _Capture(io.TextIOBase):
    def __init__(self, limit):
        self._parts = []
        self._size = 0
        self._limit = limit
        self._cut = False

    def writable(self):
        return True

    def write(self, text):
        if self._size < self._limit:
            self._parts.append(text)
            self._size += len(text)
        elif not self._cut:
            self._cut = True
            self._parts.append('\n[more output was cut off]\n')
        return len(text)

    def text(self):
        return ''.join(self._parts)


def check_syntax(code):
    try:
        compile(code, FILENAME, 'exec')
    except SyntaxError as exc:
        return json.dumps(_error_info(exc))
    return ''


def run_script(code, emit):
    ns = _namespace()
    with contextlib.redirect_stdout(_Stream('out', emit)), contextlib.redirect_stderr(_Stream('err', emit)):
        error = _load(code, ns)
    if error is not None:
        emit('error', json.dumps(error))


def _camel(name):
    parts = name.split('_')
    return parts[0] + ''.join(p[:1].upper() + p[1:] for p in parts[1:])


def _find_function(ns, name):
    fn = ns.get(name)
    if callable(fn):
        return fn
    solution = ns.get('Solution')
    if isinstance(solution, type):
        try:
            instance = solution()
        except Exception:
            return None
        for candidate in (name, _camel(name)):
            method = getattr(instance, candidate, None)
            if callable(method):
                return method
    return None


def run_tests(code, fn_name, tests_json, arg_types_json, return_type, emit):
    ns = _namespace()
    before = set(ns)
    setup = _Capture(TEST_OUTPUT_LIMIT)
    with contextlib.redirect_stdout(setup), contextlib.redirect_stderr(setup):
        error = _load(code, ns)
    if error is not None:
        emit('fatal', json.dumps(error))
        return json.dumps({'stdout': setup.text()})
    fn = _find_function(ns, fn_name)
    if fn is None:
        defined = sorted(k for k, v in ns.items() if k not in before and callable(v) and not k.startswith('_'))
        message = 'Could not find a function named ' + fn_name + '. Keep the function name from the starter code.'
        if defined:
            message += ' Your code defines: ' + ', '.join(defined) + '.'
        emit('fatal', json.dumps({'message': message, 'line': None, 'trace': []}))
        return json.dumps({'stdout': setup.text()})
    tests = json.loads(tests_json)
    kinds = json.loads(arg_types_json) if arg_types_json else []
    for i, raw in enumerate(tests):
        emit('test-start', json.dumps(i))
        result = {'i': i, 'hasActual': False}
        capture = _Capture(TEST_OUTPUT_LIMIT)
        started = time.perf_counter()
        try:
            args = json.loads(raw)
            args = [_convert_arg(a, kinds[j] if j < len(kinds) else None) for j, a in enumerate(args)]
            with contextlib.redirect_stdout(capture), contextlib.redirect_stderr(capture):
                value = fn(*args)
            elapsed = time.perf_counter() - started
            result['actual'] = _convert_result(value, return_type)
            result['hasActual'] = True
        except (Exception, SystemExit) as exc:
            elapsed = time.perf_counter() - started
            result['error'] = _error_info(exc)
        result['ms'] = round(elapsed * 1000, 2)
        result['stdout'] = capture.text()
        try:
            payload = json.dumps(result)
        except (TypeError, ValueError):
            result['actual'] = repr(result.get('actual'))
            payload = json.dumps(result)
        emit('test-result', payload)
    return json.dumps({'stdout': setup.text()})
`
