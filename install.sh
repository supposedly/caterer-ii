#!/bin/sh
npm install
npx tsc
git clone https://github.com/speedydelete/lifeweb
pushd lifeweb
npm install
npx tsc
popd
git clone https://github.com/AforAmpere/sssss