"""The HTTP API mounted at ``/api``; child packages declare access rules."""

from fastapi import params

# Anonymous access rule for modules directly under this package, cascading to any child that does
# not declare its own (``internal`` declares the same, empty, rule for itself).
dependencies: tuple[params.Depends, ...] = ()
