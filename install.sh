#!/bin/sh
git clone https://github.com/speedydelete/lifeweb
pushd lifeweb
npm install
npx tsc
popd
pushd data
git clone https://github.com/speedydelete/sssss
pushd sssss
./install
npm install
npx tsc
popd
popd
npm install
npx tsc