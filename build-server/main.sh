
#!/bin/bash

set -e

if [ -z "$GIT_REPO_URL" ]; then
  echo "Error: GIT_REPO_URL is not set."
  exit 1
fi

error_exit() {
  echo "Error on line $1"
  exit 1
}

trap 'error_exit $LINENO' ERR

echo "Cloning repository from $GIT_REPO_URL..."
if git clone "$GIT_REPO_URL" /home/app/output; then
  echo "Repository cloned successfully."
else
  echo "Failed to clone repository."
  exit 1
fi

if [ ! -d /home/app/output ]; then
  echo "Error: Cloning the repository failed. Directory /home/app/output does not exist."
  exit 1
fi

if [ ! -f script.js ]; then
  echo "Error: script.js not found."
  exit 1
fi

echo "Running script.js..."
if node script.js; then
  echo "script.js executed successfully."
else
  echo "Failed to execute script.js."
  exit 1
fi
