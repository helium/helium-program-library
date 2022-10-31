# Assumes you have the anchor repo cloned in the parent folder
rm -rf ./node_modules/@project-serum/anchor
pushd ../anchor/ts/packages/anchor
yarn && yarn build
popd
cp -r ../anchor/ts/packages/anchor node_modules/@project-serum/anchor
