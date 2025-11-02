#!/bin/sh
git clone https://github.com/speedydelete/lifeweb
pushd lifeweb
npm install
npx tsc
popd
pushd data
git clone https://github.com/AforAmpere/sssss
popd
npm install
npx tsc