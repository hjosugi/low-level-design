#!/bin/bash
set -e

# Compile Java sources
echo "--------------------------------------------------"
echo "🔨 Compiling logging-service Java project..."
echo "--------------------------------------------------"
mkdir -p bin
mise exec -- javac -cp lib/lombok.jar -d bin \
  src/main/java/logger/*.java \
  src/main/java/server/*.java \
  src/main/java/tests/*.java

if [ "$1" == "--test" ]; then
  # Run automated stress tests
  echo ""
  echo "🚀 Running Automated Core Verification Tests..."
  echo ""
  mise exec -- java -cp bin:lib/lombok.jar tests.VerifyLogger
else
  # Boot up HTTP Server
  echo ""
  echo "🚀 Launching Visualization Web Server..."
  echo ""
  mise exec -- java -cp bin:lib/lombok.jar server.Server 8080
fi
