use anchor_lang::{solana_program};
use solana_program::keccak::hashv;

pub type Node = [u8; 32];

/// Recomputes root of the Merkle tree from Node & proof
pub fn recompute(leaf: Node, proof: &[Node], index: u32) -> Node {
    let mut current_node = leaf;
    for (depth, sibling) in proof.iter().enumerate() {
        hash_to_parent(&mut current_node, sibling, index >> depth & 1 == 0);
    }
    current_node
}

/// Computes the parent node of `node` and `sibling` and copies the result into `node`
#[inline(always)]
pub fn hash_to_parent(node: &mut Node, sibling: &Node, is_left: bool) {
    let parent = if is_left {
        hashv(&[node, sibling])
    } else {
        hashv(&[sibling, node])
    };
    node.copy_from_slice(parent.as_ref())
}

pub fn verify(proof: Vec<[u8; 32]>, root: [u8; 32], leaf: [u8; 32], index: u32) -> bool {
  recompute(leaf, &proof, index) == root
}
