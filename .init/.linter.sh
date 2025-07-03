#!/bin/bash
cd /home/kavia/workspace/code-generation/cluequest-the-detectives-dilemma-103075-4bf41b33/frontend_app
npm run build
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
   exit 1
fi

