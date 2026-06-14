"""Unit tests for AST diagnostics and secure sandbox execution service."""

import unittest
from app.services.compiler import compile_and_diagnose, safe_execute_in_sandbox


class TestCompilerService(unittest.TestCase):

  def test_constant_complexity_python(self):
    code = "print('Hello world!')\n"
    res = compile_and_diagnose(code, "python")
    self.assertEqual(res["status"], "success")
    self.assertEqual(res["diagnostics"]["complexity"], "O(1)")
    self.assertTrue(res["diagnostics"]["sandbox_success"])

  def test_single_loop_complexity_python(self):
    code = "for i in range(10):\n  print(i)\n"
    res = compile_and_diagnose(code, "python")
    self.assertEqual(res["status"], "success")
    self.assertEqual(res["diagnostics"]["complexity"], "O(N)")

  def test_nested_loops_complexity_python(self):
    code = "for i in range(10):\n  for j in range(10):\n    print(i, j)\n"
    res = compile_and_diagnose(code, "python")
    self.assertEqual(res["status"], "success")
    self.assertEqual(res["diagnostics"]["complexity"], "O(N^2)")

  def test_syntax_error_python(self):
    code = "for i in range(10)\n  print(i)\n" # Missing colon
    res = compile_and_diagnose(code, "python")
    self.assertEqual(res["status"], "fail")
    self.assertFalse(res["diagnostics"]["syntax_valid"])
    self.assertIn("Syntax Error", res["feedback"])

  def test_circuit_breaker_sandbox_success(self):
    code = """
@circuitbreaker(fallback=None)
def request_ms_b_service(payload):
    return service_b.call(payload)
"""
    res = compile_and_diagnose(code, "python", context="service_breaker_trip")
    self.assertEqual(res["status"], "success")
    self.assertTrue(res["diagnostics"]["has_circuit_breaker"])
    self.assertTrue(res["diagnostics"]["has_fallback_defined"])

  def test_db_transaction_sandbox_success(self):
    code = """
try:
    db.commit()
except Exception as e:
    db.rollback()
"""
    res = compile_and_diagnose(code, "python", context="db_cpu_overload")
    self.assertEqual(res["status"], "success")
    self.assertTrue(res["diagnostics"]["has_try_except"])
    self.assertTrue(res["diagnostics"]["has_rollback"])

  def test_sql_index_optimization_success(self):
    code = "CREATE INDEX idx_user ON users(email) USING BTREE;"
    res = compile_and_diagnose(code, "sql")
    self.assertEqual(res["status"], "success")
    self.assertEqual(res["diagnostics"]["complexity"], "O(log N)")
    self.assertEqual(res["diagnostics"]["target_table"], "users")
    self.assertEqual(res["diagnostics"]["target_column"], "email")

  def test_sql_optimization_failed(self):
    code = "SELECT * FROM users WHERE email = 'test';"
    res = compile_and_diagnose(code, "sql")
    self.assertEqual(res["status"], "fail")
    self.assertEqual(res["diagnostics"]["complexity"], "O(N)")

  def test_security_sandbox_block_import(self):
    # Try importing dangerous modules
    code = "import os\nos.system('echo hack')"
    # Note: compilation itself passes for pure imports, but sandboxed run will block execution,
    # or raise NameError/ImportError. Let's verify behavior.
    res = compile_and_diagnose(code, "python")
    self.assertEqual(res["status"], "fail")
    self.assertFalse(res["diagnostics"]["sandbox_success"])

  def test_security_sandbox_block_open(self):
    # Try using blacklisted builtin 'open'
    code = "f = open('test.txt', 'w')"
    res = compile_and_diagnose(code, "python")
    self.assertEqual(res["status"], "fail")
    self.assertFalse(res["diagnostics"]["sandbox_success"])
