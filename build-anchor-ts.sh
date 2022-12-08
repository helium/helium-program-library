# Assumes you have the anchor repo cloned in the parent folder
rm -rf ./node_modules/@project-serum/anchor
pushd ../anchor/ts/packages/anchor
git checkout e8618a588f9f978bebb0596f1e50b9a209953cbf
yarn && yarn build
popd
cp -r ../anchor/ts/packages/anchor node_modules/@project-serum/anchor
