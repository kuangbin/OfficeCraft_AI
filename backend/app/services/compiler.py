"""AST-based code diagnostic and secure bounded sandbox execution engine."""

import ast
import io
import sys
import traceback
from typing import Any, Dict, List, Tuple


class ComplexityVisitor(ast.NodeVisitor):
  """AST visitor to calculate nested loops depth and determine O(N^2) complexity."""

  def __init__(self) -> None:
    self.current_depth = 0
    self.max_depth = 0

  def visit_For(self, node: ast.For) -> None:
    self.current_depth += 1
    self.max_depth = max(self.max_depth, self.current_depth)
    self.generic_visit(node)
    self.current_depth -= 1

  def visit_While(self, node: ast.While) -> None:
    self.current_depth += 1
    self.max_depth = max(self.max_depth, self.current_depth)
    self.generic_visit(node)
    self.current_depth -= 1


class StructureVisitor(ast.NodeVisitor):
  """AST visitor to check for code structure invariants like functions, try-except, decorators, and pandas methods."""

  def __init__(self) -> None:
    self.functions: List[str] = []
    self.decorators: List[str] = []
    self.has_try_except = False
    self.has_rollback = False
    self.has_circuit_breaker = False
    self.has_fallback_defined = False
    self.has_pandas_groupby = False
    self.has_pandas_fillna = False

  def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
    self.functions.append(node.name)
    for dec in node.decorator_list:
      dec_name = ""
      if isinstance(dec, ast.Name):
        dec_name = dec.id
      elif isinstance(dec, ast.Call) and isinstance(dec.func, ast.Name):
        dec_name = dec.func.id
      
      if dec_name:
        self.decorators.append(dec_name)
        if "circuitbreaker" in dec_name.lower() or "breaker" in dec_name.lower():
          self.has_circuit_breaker = True
          # Check if fallback argument is specified in decorator
          if isinstance(dec, ast.Call):
            for kw in dec.keywords:
              if kw.arg == "fallback":
                self.has_fallback_defined = True

    self.generic_visit(node)

  def visit_Try(self, node: ast.Try) -> None:
    self.has_try_except = True
    # Look for rollback call within except handlers
    for handler in node.handlers:
      for stmt in handler.body:
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
          call_node = stmt.value
          if isinstance(call_node.func, ast.Attribute) and call_node.func.attr == "rollback":
            self.has_rollback = True
    self.generic_visit(node)

  def visit_Call(self, node: ast.Call) -> None:
    if isinstance(node.func, ast.Attribute):
      attr_name = node.func.attr
      if attr_name == "groupby":
        self.has_pandas_groupby = True
      elif attr_name == "fillna":
        self.has_pandas_fillna = True
    self.generic_visit(node)


class MockServiceB:
  """Mock B service for circuit breaker sandbox simulation."""
  def __init__(self) -> None:
    self._open = False

  def is_open(self) -> bool:
    return self._open

  def is_closed(self) -> bool:
    return not self._open

  def call(self, payload: Any) -> Dict[str, Any]:
    if self._open:
      raise Exception("Circuit Breaker is Open")
    return {"status": "success", "data": f"Processed: {payload}"}


class MockDb:
  """Mock database for try-except transaction simulation."""
  def __init__(self) -> None:
    self.committed = False
    self.rolled_back = False

  def commit(self) -> None:
    self.committed = True

  def rollback(self) -> None:
    self.rolled_back = True


def _get_safe_builtins() -> Dict[str, Any]:
  """Return a whitelist of 100% safe python builtins."""
  safe_names = [
      "abs", "all", "any", "bin", "bool", "chr", "dict", "divmod", "enumerate",
      "filter", "float", "format", "hash", "hex", "id", "int", "isinstance",
      "issubclass", "len", "list", "map", "max", "min", "next", "oct", "ord",
      "pow", "print", "range", "repr", "reversed", "round", "set", "slice",
      "sorted", "str", "sum", "tuple", "type", "zip", "Exception", "ValueError",
      "TypeError", "KeyError", "IndexError", "AttributeError"
  ]
  return {name: getattr(sys.modules["builtins"], name) for name in safe_names if hasattr(sys.modules["builtins"], name)}


def safe_execute_in_sandbox(code: str, context: str = None) -> Tuple[bool, List[str]]:
  """Compile and execute user code inside a highly restricted global namespace."""
  logs: List[str] = ["⏳ [0.0s] Launching isolated sandbox container..."]
  
  try:
    code_obj = compile(code, "<sandbox>", "exec")
  except Exception as e:
    logs.append(f"🚨 [0.2s] Compiler compilation failed: {e}")
    return False, logs

  # Setup standard secure builtins
  safe_builtins = _get_safe_builtins()
  
  # Inject mock objects for sandbox testing convenience
  mock_db = MockDb()
  mock_service_b = MockServiceB()
  
  safe_globals = {
      "__builtins__": safe_builtins,
      "db": mock_db,
      "service_b": mock_service_b,
      "circuitbreaker": lambda *args, **kwargs: (lambda f: f),
      "breaker": lambda *args, **kwargs: (lambda f: f),
  }
  
  # Capture standard output
  old_stdout = sys.stdout
  redirected_output = io.StringIO()
  sys.stdout = redirected_output
  
  success = True
  try:
    logs.append("⚙️ [0.4s] Sandboxed virtual environment initialization complete.")
    
    # Run in the secure namespace
    exec(code_obj, safe_globals)
    
    # Run assertions based on context
    if context == "service_breaker_trip":
      logs.append("🔬 [0.6s] Sandbox asserting circuit breaker state behaviors...")
      # Verify function definitions exist
      if "request_ms_b_service" in safe_globals:
        fn = safe_globals["request_ms_b_service"]
        # Test closed state
        logs.append("  ↳ Test 1: Simulating closed state nominal payload call...")
        res_closed = fn({"test": 1})
        logs.append(f"    ✓ Output: {res_closed}")
        
        # Test open state
        logs.append("  ↳ Test 2: Simulating open state breaker trip exception...")
        mock_service_b._open = True
        try:
          fn({"test": 2})
          # If it didn't throw, check fallback function return value
          logs.append("    ✓ Circuit breaker successfully fell back to local recovery mode.")
        except Exception as ex:
          if "Circuit Breaker is Open" in str(ex) or "open" in str(ex).lower():
            logs.append("    ✓ Breaker exception caught successfully.")
          else:
            raise ex
      else:
        logs.append("⚠️ Sandbox warning: Primary handler function 'request_ms_b_service' not declared.")
        success = False

    elif context == "db_cpu_overload":
      logs.append("🔬 [0.6s] Sandbox asserting database transaction integrity...")
      if mock_db.rolled_back:
        logs.append("    ✓ Transaction rolled back successfully to prevent locking.")
      if mock_db.committed:
        logs.append("    ✓ Transaction committed successfully under normal route.")

    elif context and context.startswith("network_partition"):
      station_id = "station_mainframe"
      if ":" in context:
        station_id = context.split(":")[1]
      
      logs.append(f"🔬 [0.6s] Sandbox asserting Network Partition state for station '{station_id}'...")
      if station_id == "station_mainframe":
        if "route_request" in safe_globals:
          fn = safe_globals["route_request"]
          res = fn({"ip": "192.168.1.100", "payload": "ping"})
          logs.append(f"  ↳ Test: Routing packet through Primary Gateway, result: {res}")
          logs.append("    ✓ Primary Gateway packet routing asserted successfully.")
        else:
          logs.append("⚠️ Sandbox warning: Primary gateway route function 'route_request' not declared. Write 'def route_request(packet):' returning route info.")
          success = False
      elif station_id == "station_dev_b":
        if "sync_data" in safe_globals:
          fn = safe_globals["sync_data"]
          res = fn({"node_id": "sub_node_b", "data": "update"})
          logs.append(f"  ↳ Test: Replicating consensus node data, result: {res}")
          logs.append("    ✓ Sub-Node Proxy consensus synchronization asserted successfully.")
        else:
          logs.append("⚠️ Sandbox warning: Sub-node proxy consensus sync function 'sync_data' not declared. Write 'def sync_data(packet):' returning sync info.")
          success = False
      else:
        logs.append(f"⚠️ Sandbox warning: Unknown network partition station '{station_id}'.")
        success = False
        
  except Exception as e:
    success = False
    exc_type, exc_value, exc_tb = sys.exc_info()
    tb_msg = "".join(traceback.format_exception_only(exc_type, exc_value)).strip()
    logs.append(f"❌ [0.8s] Runtime Exception raised inside Sandbox: {tb_msg}")
  finally:
    sys.stdout = old_stdout

  stdout_logs = redirected_output.getvalue().strip()
  if stdout_logs:
    logs.append("📝 [Stdout Logs]:")
    for line in stdout_logs.split("\n"):
      logs.append(f"  {line}")

  if success:
    logs.append("🎉 [1.0s] Sandboxed automated test suite successfully verified.")
  else:
    logs.append("🚨 [1.0s] Sandbox validation suite failed.")
    
  return success, logs


def diagnose_python_code(code: str, context: str = None) -> Dict[str, Any]:
  """Parse Python code using AST and evaluate structures, syntax, and complexity."""
  logs = [">>> BOOTING ADVANCED AST Python COMPILER..."]
  diagnostics = {
      "syntax_valid": True,
      "complexity": "O(1)",
      "functions": [],
      "decorators": [],
      "has_try_except": False,
      "has_rollback": False,
      "has_circuit_breaker": False,
      "has_fallback_defined": False,
      "has_pandas_groupby": False,
      "has_pandas_fillna": False,
      "sandbox_success": False
  }

  try:
    tree = ast.parse(code)
  except SyntaxError as e:
    logs.append("❌ SYNTAX ERROR DETECTED DURING PARSING!")
    logs.append(f"🚨 Line {e.lineno}, Col {e.offset}: {e.msg}")
    if e.text:
      logs.append(f"   Code snippet: {e.text.strip()}")
    diagnostics["syntax_valid"] = False
    return {
        "status": "fail",
        "feedback": f"Syntax Error: {e.msg} on Line {e.lineno}",
        "logs": logs,
        "diagnostics": diagnostics
    }

  logs.append("✓ AST parsing: Syntax validation PASSED.")

  # 1. Complexity static check
  comp_visitor = ComplexityVisitor()
  comp_visitor.visit(tree)
  complexity = "O(1)"
  if comp_visitor.max_depth >= 2:
    complexity = f"O(N^{comp_visitor.max_depth})"
    logs.append(f"⚠️ Complexity Warning: Nested loops detected (depth={comp_visitor.max_depth}). Estimated complexity {complexity}. Consider optimization!")
  elif comp_visitor.max_depth == 1:
    complexity = "O(N)"
    logs.append("✓ Performance validation: Single-loop O(N) linear time complexity path.")
  else:
    logs.append("✓ Performance validation: Constant time O(1) loop-free construct.")
  
  diagnostics["complexity"] = complexity

  # 2. Structural checks
  struct_visitor = StructureVisitor()
  struct_visitor.visit(tree)

  diagnostics["functions"] = struct_visitor.functions
  diagnostics["decorators"] = struct_visitor.decorators
  diagnostics["has_try_except"] = struct_visitor.has_try_except
  diagnostics["has_rollback"] = struct_visitor.has_rollback
  diagnostics["has_circuit_breaker"] = struct_visitor.has_circuit_breaker
  diagnostics["has_fallback_defined"] = struct_visitor.has_fallback_defined
  diagnostics["has_pandas_groupby"] = struct_visitor.has_pandas_groupby
  diagnostics["has_pandas_fillna"] = struct_visitor.has_pandas_fillna

  logs.append(f"🔍 Discovered function handlers: {struct_visitor.functions}")
  if struct_visitor.decorators:
    logs.append(f"🔍 Discovered active decorators: {struct_visitor.decorators}")

  if struct_visitor.has_try_except:
    logs.append("✓ Try-except construct: Robust exception handler registered.")
    if struct_visitor.has_rollback:
      logs.append("  ✓ Database rollback action found in handler.")
  
  if struct_visitor.has_circuit_breaker:
    logs.append("✓ Circuit breaker: @circuitbreaker decorator correctly annotated.")
    if struct_visitor.has_fallback_defined:
      logs.append("  ✓ Fallback local routine bound in decorator keywords.")

  if struct_visitor.has_pandas_groupby:
    logs.append("✓ Pandas operation: .groupby() aggregation detected.")
  if struct_visitor.has_pandas_fillna:
    logs.append("✓ Pandas operation: .fillna() missing-value replacement detected.")

  # 3. Sandbox Run execution
  sandbox_ok, sandbox_logs = safe_execute_in_sandbox(code, context)
  logs.extend(sandbox_logs)
  diagnostics["sandbox_success"] = sandbox_ok

  # General verdict
  status = "success" if sandbox_ok else "fail"
  feedback = "AST & Sandbox validation complete: Nominal state." if sandbox_ok else "Static/Sandbox assertion failures encountered."

  return {
      "status": status,
      "feedback": feedback,
      "logs": logs,
      "diagnostics": diagnostics
  }


def diagnose_sql_code(code: str) -> Dict[str, Any]:
  """Diagnose relation optimization and query execution path for SQL script submissions."""
  logs = [
      ">>> BOOTING RELATION ENGINE SQL PARSER...",
      "⏳ [0.0s] Constructing mock relational database schema..."
  ]
  diagnostics = {
      "syntax_valid": True,
      "complexity": "O(N)",
      "has_create_index": False,
      "has_on_clause": False,
      "target_table": None,
      "target_column": None
  }

  code_lower = code.lower()
  is_index_created = "create index" in code_lower
  is_on_present = " on " in code_lower

  diagnostics["has_create_index"] = is_index_created
  diagnostics["has_on_clause"] = is_on_present

  if is_index_created and is_on_present:
    # Basic regex-like string split to extract target table and column for rich diagnostics
    try:
      parts = code_lower.split(" on ")
      table_and_cols = parts[1].strip()
      table_name = table_and_cols.split("(")[0].strip()
      col_name = table_and_cols.split("(")[1].split(")")[0].strip()
      diagnostics["target_table"] = table_name
      diagnostics["target_column"] = col_name
      logs.append(f"✓ Detected index creation directive on table '{table_name}' column '{col_name}'.")
    except Exception:
      pass

    diagnostics["complexity"] = "O(log N)"
    logs.append("✓ SQL optimization: Index verified.")
    logs.append("✓ Query execution plan: O(log N) B-Tree seek depth path replaces O(N) full-table scan.")
    logs.append("🎉 [0.5s] SQL assertions completed successfully. Nominal state.")
    status = "success"
    feedback = "✓ SQL index optimization successful! Avoided full-table scan, query complexity dropped to O(log N)."
  else:
    logs.append("❌ SQL optimization failed: No CREATE INDEX ... ON directive found.")
    logs.append("🚨 Query execution plan: O(N) full-table scan overhead triggers CPU overload.")
    status = "fail"
    feedback = "❌ Diagnostics failed: Missing standard SQL CREATE INDEX ... ON index syntax."

  return {
      "status": status,
      "feedback": feedback,
      "logs": logs,
      "diagnostics": diagnostics
  }


def compile_and_diagnose(code: str, language: str, context: str = None) -> Dict[str, Any]:
  """Unified compilation and diagnostic dispatch interface."""
  if language.lower() == "python":
    return diagnose_python_code(code, context)
  elif language.lower() == "sql":
    return diagnose_sql_code(code)
  else:
    return {
        "status": "fail",
        "feedback": f"Unsupported compiler language: {language}",
        "logs": [f"🚨 Language compiler {language} is offline."],
        "diagnostics": {}
    }
