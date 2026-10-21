//! `houhub-cli`: run a prompt through a running houhub from a script or CI.
//! Everything is in `houhub_lib::cli`; see `docs/cli.md`.

fn main() -> std::process::ExitCode {
    houhub_lib::cli::main()
}
