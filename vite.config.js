export default {
    base: '/games/glass-bridge/',
    publicDir: 'public',
    optimizeDeps: {
      esbuildOptions: {
        target: "esnext",
      },
      exclude: ['@noir-lang/noirc_abi', '@noir-lang/acvm_js']
    },
    build: {
      target: "esnext",
    },
  };
  