"""Utilidades CLI de administración (usar con: python -m app.cli <comando>).

Comandos:
  secret          Generar un secreto JWT fuerte (stdout, no se loguea).
  create-admin    Crear/actualizar el primer administrador de la instalación ECAP.
"""
from __future__ import annotations

import argparse
import getpass
import os
import secrets
import sys

from app.core.db import SessionLocal
from app.core.security import hash_password, password_policy_error
from app.modules.identity import service as ids
from app.modules.identity.models import User


def cmd_secret(_: argparse.Namespace) -> int:
    print(secrets.token_urlsafe(48))
    return 0


def cmd_create_admin(args: argparse.Namespace) -> int:
    email = (args.email or input("Correo del administrador: ")).strip().lower()
    if not email:
        print("El correo es obligatorio", file=sys.stderr)
        return 2

    if args.password_env:
        password = os.environ.get(args.password_env, "")
        if not password:
            print("La variable de entorno indicada está vacía", file=sys.stderr)
            return 2
    else:
        password = getpass.getpass("Contraseña (no se guarda en el historial del shell): ")
        confirm = getpass.getpass("Confirme la contraseña: ")
        if password != confirm:
            print("Las contraseñas no coinciden", file=sys.stderr)
            return 2

    err = password_policy_error(password)
    if err:
        print(err, file=sys.stderr)
        return 2

    session = SessionLocal()
    try:
        ids.seed_roles(session)
        user = ids.get_user_by_email(session, email)
        if user is None:
            user = User(
                email=email,
                full_name=args.full_name or "Administrador ECAP",
                password_hash=hash_password(password),
                role_code="admin",
                must_change_password=False,
            )
            session.add(user)
        else:
            user.password_hash = hash_password(password)
            user.role_code = "admin"
            user.active = True
        session.commit()
        print(f"Administrador listo: {email} (id {user.id})")
        return 0
    finally:
        session.close()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="app.cli")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("secret").set_defaults(func=cmd_secret)

    p = sub.add_parser("create-admin")
    p.add_argument("--email")
    p.add_argument("--full-name")
    p.add_argument(
        "--password-env",
        help="Nombre de variable de entorno con la contraseña (evita args de proceso)",
    )
    p.set_defaults(func=cmd_create_admin)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
