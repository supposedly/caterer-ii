#!/bin/sh
git clone https://github.com/speedydelete/lifeweb
pushd lifeweb
npm install
npx tsc
popd
npm install
npx tsc