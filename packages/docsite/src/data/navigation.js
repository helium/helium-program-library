export const navigation = [
  {
    title: "Introduction",
    icon: (
      <svg
        width="13"
        height="15"
        viewBox="0 0 13 15"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          d="M0.780579 3.87629C0.288408 4.25488 0 4.8406 0 5.46154V12.4767C0 13.5813 0.895431 14.4767 2 14.4767H11C12.1046 14.4767 13 13.5813 13 12.4767V5.46154C13 4.8406 12.7116 4.25488 12.2194 3.87629L7.71942 0.414752C7.00052 -0.138251 5.99948 -0.13825 5.28058 0.414752L0.780579 3.87629Z"
          fill="#9D5FEB"
        />
      </svg>
    ),
    links: [
      { title: "Installation", href: "/docs/installation" },
      { title: "Overview", href: "/docs/overview" },
    ],
  },
  {
    title: "Learn",
    icon: (
      <svg
        width="18"
        height="21"
        viewBox="0 0 18 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          opacity="0.4"
          d="M12.5 6C13.3284 6 14 6.67157 14 7.5L14 12.5L14 17.5C14 18.3284 13.3284 19 12.5 19L4 19C3.44772 19 3 18.5523 3 18L3 7.5C3 6.67157 3.67157 6 4.5 6L12.5 6Z"
          fill="#9D5FEB"
        />
        <path
          d="M16 14C16 15.1046 15.1046 16 14 16L10.5 16L6 16C5.44772 16 5 15.5523 5 15L5 5C5 3.89543 5.89543 3 7 3L14 3C15.1046 3 16 3.89543 16 5L16 14Z"
          fill="#9D5FEB"
        />
        <path
          opacity="0.5"
          d="M13 6C13.5523 6 14 6.44772 14 7V7V7C14 7.55228 13.5523 8 13 8L8 8C7.44772 8 7 7.55228 7 7V7C7 6.44772 7.44772 6 8 6L13 6Z"
          fill="#1A1F36"
        />
        <path
          opacity="0.5"
          d="M13 9C13.5523 9 14 9.44772 14 10V10V10C14 10.5523 13.5523 11 13 11L8 11C7.44772 11 7 10.5523 7 10V10C7 9.44772 7.44772 9 8 9L13 9Z"
          fill="#1A1F36"
        />
      </svg>
    ),
    links: [
      { title: "Getting Started", href: "/docs/learn/getting_started" },
      { title: "React", href: "/docs/learn/react" },
    ],
  },
  {
    title: "API",
    icon: (
      <svg
        width="18"
        height="21"
        viewBox="0 0 18 21"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M1 6.31299C1 5.7607 1.44772 5.31299 2 5.31299H4C4.55228 5.31299 5 5.7607 5 6.31299V16.313C5 16.8653 4.55228 17.313 4 17.313H2C1.44772 17.313 1 16.8653 1 16.313V6.31299Z"
          fill="#9D5FEB"
        />
        <path
          d="M6 6.31299C6 5.7607 6.44772 5.31299 7 5.31299H9C9.55228 5.31299 10 5.7607 10 6.31299V16.313C10 16.8653 9.55228 17.313 9 17.313H7C6.44772 17.313 6 16.8653 6 16.313V6.31299Z"
          fill="#9D5FEB"
        />
        <path
          d="M10.7744 7.00108C10.6315 6.46762 10.9481 5.91928 11.4816 5.77634L13.4134 5.2587C13.9469 5.11576 14.4952 5.43234 14.6381 5.96581L17.2263 15.6251C17.3693 16.1585 17.0527 16.7069 16.5192 16.8498L14.5874 17.3674C14.0539 17.5104 13.5056 17.1938 13.3626 16.6603L10.7744 7.00108Z"
          fill="#513870"
        />
      </svg>
    ),
    links: [
      // DOCS NAVIGATION START
      { title: "Welcome pack", href: "/docs/api/welcome-pack-sdk" },

      {
        title: "Voter stake registry",
        href: "/docs/api/voter-stake-registry-sdk",
      },

      {
        title: "Treasury management",
        href: "/docs/api/treasury-management-sdk",
      },

      { title: "Sessions", href: "/docs/api/sessions-sdk" },

      { title: "Rewards oracle", href: "/docs/api/rewards-oracle-sdk" },

      { title: "Price oracle", href: "/docs/api/price-oracle-sdk" },

      { title: "No emit", href: "/docs/api/no-emit-sdk" },

      {
        title: "Mobile entity manager",
        href: "/docs/api/mobile-entity-manager-sdk",
      },

      { title: "Mini fanout", href: "/docs/api/mini-fanout-sdk" },

      { title: "Lazy transactions", href: "/docs/api/lazy-transactions-sdk" },

      { title: "Lazy distributor", href: "/docs/api/lazy-distributor-sdk" },

      { title: "Hpl crons", href: "/docs/api/hpl-crons-sdk" },

      { title: "Hexboosting", href: "/docs/api/hexboosting-sdk" },

      { title: "Helium sub daos", href: "/docs/api/helium-sub-daos-sdk" },

      {
        title: "Helium entity manager",
        href: "/docs/api/helium-entity-manager-sdk",
      },

      { title: "Fanout", href: "/docs/api/fanout-sdk" },

      { title: "Dc auto top", href: "/docs/api/dc-auto-top-sdk" },

      { title: "Data credits", href: "/docs/api/data-credits-sdk" },

      { title: "Circuit breaker", href: "/docs/api/circuit-breaker-sdk" },

      // DOCS NAVIGATION END
    ],
  },

  // {
  //   title: "EXAMPLES",
  //   icon: (
  //     <svg
  //       xmlns="http://www.w3.org/2000/svg"
  //       width="18"
  //       height="21"
  //       fill="none"
  //     >
  //       <path
  //         fill="#2EE0B5"
  //         stroke="#2EE0B5"
  //         d="M12.5 5v9a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 14V5A1.5 1.5 0 0 1 4 3.5h7A1.5 1.5 0 0 1 12.5 5Z"
  //       />
  //       <path
  //         fill="#2EE0B5"
  //         stroke="#2EE0B5"
  //         d="M15.5 8v9a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 17V8A1.5 1.5 0 0 1 7 6.5h7A1.5 1.5 0 0 1 15.5 8Z"
  //         opacity=".4"
  //       />
  //     </svg>
  //   ),
  //   links: [
  //     // DOCS EXAMPLES START
  //     { title: "Utils examples", href: "/docs/examples/utils-examples" },

  //     {
  //       title: "Token voter examples",
  //       href: "/docs/examples/token-voter-examples",
  //     },

  //     {
  //       title: "State controller examples",
  //       href: "/docs/examples/state-controller-examples",
  //     },

  //     { title: "Proposal examples", href: "/docs/examples/proposal-examples" },

  //     {
  //       title: "Organization examples",
  //       href: "/docs/examples/organization-examples",
  //     },

  //     {
  //       title: "Nft voter examples",
  //       href: "/docs/examples/nft-voter-examples",
  //     },

  //     // DOCS EXAMPLES END
  //   ],
  // },
]
