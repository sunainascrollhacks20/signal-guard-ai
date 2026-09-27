#!/bin/bash

# SignalGuard AI Authentication Test Suite

echo "🧪 SignalGuard AI - Authentication Test Suite"
echo "=============================================="
echo ""

BASE_URL="http://localhost:3000"
COOKIE_FILE="/tmp/signalguard-test-cookies.txt"

# Clean up
rm -f $COOKIE_FILE

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

test_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $2"
    ((TESTS_PASSED++))
  else
    echo -e "${RED}✗ FAIL${NC}: $2"
    ((TESTS_FAILED++))
  fi
}

echo "Test 1: Health Check"
echo "--------------------"
RESPONSE=$(curl -s "$BASE_URL/api/health")
echo "$RESPONSE" | jq . > /dev/null 2>&1
test_result $? "Health endpoint returns valid JSON"

STATUS=$(echo "$RESPONSE" | jq -r '.data.status' 2>/dev/null)
[ "$STATUS" = "healthy" ]
test_result $? "Health status is 'healthy'"
echo ""

echo "Test 2: Login with Demo Credentials"
echo "-----------------------------------"
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@signalguard.local","password":"SignalGuard@2026"}' \
  -c $COOKIE_FILE)

echo "$LOGIN_RESPONSE" | jq . > /dev/null 2>&1
test_result $? "Login endpoint returns valid JSON"

SUCCESS=$(echo "$LOGIN_RESPONSE" | jq -r '.success' 2>/dev/null)
[ "$SUCCESS" = "true" ]
test_result $? "Login successful"

USER_EMAIL=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.email' 2>/dev/null)
[ "$USER_EMAIL" = "admin@signalguard.local" ]
test_result $? "Correct user email returned"

USER_ROLE=$(echo "$LOGIN_RESPONSE" | jq -r '.data.user.role' 2>/dev/null)
[ "$USER_ROLE" = "admin" ]
test_result $? "Correct user role returned"
echo ""

echo "Test 3: Session Cookie"
echo "----------------------"
grep -q "signalguard_session" $COOKIE_FILE
test_result $? "Session cookie set"
echo ""

echo "Test 4: Authenticated Request (/api/auth/me)"
echo "--------------------------------------------"
ME_RESPONSE=$(curl -s "$BASE_URL/api/auth/me" -b $COOKIE_FILE)

echo "$ME_RESPONSE" | jq . > /dev/null 2>&1
test_result $? "/me endpoint returns valid JSON"

ME_SUCCESS=$(echo "$ME_RESPONSE" | jq -r '.success' 2>/dev/null)
[ "$ME_SUCCESS" = "true" ]
test_result $? "/me request successful"

ME_EMAIL=$(echo "$ME_RESPONSE" | jq -r '.data.user.email' 2>/dev/null)
[ "$ME_EMAIL" = "admin@signalguard.local" ]
test_result $? "Authenticated user email correct"
echo ""

echo "Test 5: System Status (Authenticated)"
echo "-------------------------------------"
STATUS_RESPONSE=$(curl -s "$BASE_URL/api/system/status" -b $COOKIE_FILE)

echo "$STATUS_RESPONSE" | jq . > /dev/null 2>&1
test_result $? "System status returns valid JSON"

SYSTEM_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.system' 2>/dev/null)
[ "$SYSTEM_STATUS" = "ONLINE" ]
test_result $? "System status is ONLINE"

AI_STATUS=$(echo "$STATUS_RESPONSE" | jq -r '.data.aiEngine' 2>/dev/null)
[ "$AI_STATUS" = "UNAVAILABLE" ]
test_result $? "AI Engine status is UNAVAILABLE (honest reporting)"
echo ""

echo "Test 6: Logout"
echo "--------------"
LOGOUT_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/logout" -b $COOKIE_FILE)

echo "$LOGOUT_RESPONSE" | jq . > /dev/null 2>&1
test_result $? "Logout endpoint returns valid JSON"

LOGOUT_SUCCESS=$(echo "$LOGOUT_RESPONSE" | jq -r '.success' 2>/dev/null)
[ "$LOGOUT_SUCCESS" = "true" ]
test_result $? "Logout successful"
echo ""

echo "Test 7: Session Invalidated After Logout"
echo "----------------------------------------"
ME_AFTER_LOGOUT=$(curl -s "$BASE_URL/api/auth/me" -b $COOKIE_FILE)

AFTER_LOGOUT_SUCCESS=$(echo "$ME_AFTER_LOGOUT" | jq -r '.success' 2>/dev/null)
[ "$AFTER_LOGOUT_SUCCESS" = "false" ]
test_result $? "Session invalidated after logout"
echo ""

echo "Test 8: Wrong Password"
echo "----------------------"
WRONG_PW_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@signalguard.local","password":"WrongPassword"}')

WRONG_PW_SUCCESS=$(echo "$WRONG_PW_RESPONSE" | jq -r '.success' 2>/dev/null)
[ "$WRONG_PW_SUCCESS" = "false" ]
test_result $? "Login rejected with wrong password"

WRONG_PW_CODE=$(echo "$WRONG_PW_RESPONSE" | jq -r '.error.code' 2>/dev/null)
[ "$WRONG_PW_CODE" = "INVALID_CREDENTIALS" ]
test_result $? "Correct error code for invalid credentials"
echo ""

echo "Test 9: Non-existent User"
echo "-------------------------"
NO_USER_RESPONSE=$(curl -s -X POST "$BASE_URL/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"nonexistent@test.com","password":"password"}')

NO_USER_SUCCESS=$(echo "$NO_USER_RESPONSE" | jq -r '.success' 2>/dev/null)
[ "$NO_USER_SUCCESS" = "false" ]
test_result $? "Login rejected for non-existent user"
echo ""

echo "Test 10: Unauthenticated System Status Request"
echo "----------------------------------------------"
UNAUTH_STATUS=$(curl -s "$BASE_URL/api/system/status")

UNAUTH_SUCCESS=$(echo "$UNAUTH_STATUS" | jq -r '.success' 2>/dev/null)
[ "$UNAUTH_SUCCESS" = "false" ]
test_result $? "System status requires authentication"

UNAUTH_CODE=$(echo "$UNAUTH_STATUS" | jq -r '.error.code' 2>/dev/null)
[ "$UNAUTH_CODE" = "UNAUTHORIZED" ]
test_result $? "Correct error code for unauthorized request"
echo ""

# Summary
echo "=============================================="
echo "Test Summary"
echo "=============================================="
echo -e "Tests Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "Tests Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed!${NC}"
  exit 0
else
  echo -e "${RED}✗ Some tests failed${NC}"
  exit 1
fi
