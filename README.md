# Proxmox CLI

A personal CLI for managing Proxmox VMs with a developer-friendly interface.

## Setup

Configure your Proxmox connection:

```bash
proxmox config set PROXMOX_HOST=192.168.1.182
proxmox config set PROXMOX_API_TOKEN=root@pam!cli=your-token-here
```

View current configuration:

```bash
proxmox config get
```

## Image Types

The CLI supports three types of bootable images:

### ISOs

ISOs are installer images (e.g., `nixos-24.11.iso`, `ubuntu-22.04.iso`). Use these to install an operating system from scratch.

```bash
# Upload an ISO
proxmox images upload ./nixos-24.11.iso

# Create a VM from ISO (requires manual OS installation)
proxmox new my-vm --iso nixos-24.11.iso
```

### Templates

Templates are pre-configured VMs that have been converted to a read-only state. They serve as base images for quickly spinning up new VMs without reinstalling the OS.

```bash
# Create a template from an existing VM
proxmox images new my-configured-vm my-template

# List available templates
proxmox images ls
```

**How templates work:**
- Converting a VM to a template makes it read-only
- The original VM ID is preserved, but the VM can no longer be started
- Templates support efficient cloning (see below)
- A cloud-init drive is automatically added to enable hostname injection

### Cloning from Templates

When you create a VM from a template, you're cloning it. There are two clone types:

#### Linked Clone (default)

A linked clone shares the template's disk as a read-only base, with changes written to a new overlay disk.

```bash
proxmox new my-clone --template my-template
```

**Pros:**
- Fast to create (instant)
- Uses minimal disk space initially
- Space-efficient for many similar VMs
- **Hostname is automatically set** to the VM name via cloud-init

**Cons:**
- Cannot delete the template while linked clones exist
- Slightly slower disk I/O (reads may go to base + overlay)
- Clone depends on template's disk integrity

#### Full Clone

A full clone creates a complete, independent copy of the template's disk.

```bash
proxmox new my-clone --template my-template --full
```

**Pros:**
- Completely independent of the template
- Template can be deleted after cloning
- No performance overhead

**Cons:**
- Slower to create (copies entire disk)
- Uses full disk space immediately

### When to Use Each

| Scenario | Recommended |
|----------|-------------|
| Installing a new OS | ISO |
| Quick dev/test environments | Linked Clone |
| Production VMs | Full Clone |
| Many similar VMs (CI runners, etc.) | Linked Clone |
| Long-lived independent VMs | Full Clone |

## Commands

### VMs

```bash
proxmox ls                    # List all VMs
proxmox get <vm>              # Show VM details
proxmox new <name> --iso <iso>           # Create from ISO
proxmox new <name> --template <template> # Clone from template
proxmox new <name> --template <template> --full  # Full clone
proxmox new <name> --iso <iso> --cpu-type x86-64-v2-AES  # Override the CPU type
proxmox update <vm> --cpu-type host      # Change a VM's CPU type
proxmox update <vm> --cpu 8 --memory 8192  # Change a VM's cores and RAM (MB)
proxmox start <vm>            # Start a VM
proxmox stop <vm>             # Stop a VM
proxmox rm <vm>               # Destroy a VM
proxmox ssh <vm>              # SSH into a VM
proxmox provision <vm> <cfg>  # Provision NixOS on VM
```

### Images (ISOs & Templates)

```bash
proxmox images ls             # List ISOs and templates
proxmox images upload <path>  # Upload an ISO
proxmox images new <vm> <name>  # Create template from VM
proxmox images rm <name>      # Delete ISO or template
```

### Backups

```bash
proxmox backup <vm>           # Back up a VM while it keeps running
proxmox backup <vm> --stop    # Shut the VM down for the backup, then restart it
proxmox backups ls [vm]       # List backups
proxmox restore <vm> [name]   # Restore a VM's latest backup as a new VM
proxmox restore <backup-file> [name]  # Restore a specific backup
proxmox restore <vm> <name> --new-mac # Restore alongside the original VM
```

Backups are full `vzdump` archives written to `DEFAULT_BACKUP_STORAGE`. A restore
always creates a new VM and leaves it stopped; it never overwrites an existing one.
`[name]` defaults to the name the VM had when it was backed up. The restored VM
keeps the original MAC address and USB devices unless `--new-mac` is given, so do
not run it next to the original without that flag. Restoring runs `qmrestore`
over SSH, like the USB commands.

### Host

```bash
proxmox host                  # Show host hardware specs and usage
```

Model, BIOS, max CPU speed and memory modules are read with `dmidecode` and
`lscpu` over SSH; everything else comes from the API.

### USB Passthrough

```bash
proxmox usb ls                # List USB devices on host
proxmox usb attach <vm> <id>  # Attach USB device to VM
proxmox usb detach <vm> <id>  # Detach USB device from VM
```

### Configuration

```bash
proxmox config get            # Show current config
proxmox config set KEY=value  # Set config value
```

## Configuration Options

| Key | Description | Default |
|-----|-------------|---------|
| `PROXMOX_HOST` | Proxmox server IP/hostname | (required) |
| `PROXMOX_API_TOKEN` | API token (`user@realm!tokenid=secret`) | (required) |
| `PROXMOX_NODE` | Proxmox node name | `pve` |
| `PROXMOX_USER` | SSH user for USB and restore commands | `root` |
| `SSH_KEY_PATH` | SSH private key path | `~/.ssh/id_rsa` |
| `DEFAULT_VM_STORAGE` | Storage for VM disks | `local-lvm` |
| `DEFAULT_ISO_STORAGE` | Storage for ISOs | `local` |
| `DEFAULT_BACKUP_STORAGE` | Storage for backups | `local` |
| `DEFAULT_VM_CPU` | Default CPU cores | `4` |
| `DEFAULT_VM_CPU_TYPE` | Default CPU type for new VMs | `host` |
| `DEFAULT_VM_RAM` | Default RAM in MB | `4096` |
| `DEFAULT_VM_DISK` | Default disk in GB | `128` |
| `DEFAULT_SSH_USER` | Default SSH user for VMs | `root` |

## Typical Workflow

1. **Initial setup**: Upload an ISO and create a VM

   ```bash
   proxmox images upload ./nixos-24.11.iso
   proxmox new base-vm --iso nixos-24.11.iso
   ```

2. **Configure the VM**: SSH in and set up the OS

   ```bash
   proxmox ssh base-vm
   # ... install and configure OS ...
   ```

3. **Create a template**: Save your configured VM as a reusable template

   ```bash
   proxmox images new base-vm nixos-base
   ```

4. **Clone as needed**: Spin up new VMs from the template

   ```bash
   proxmox new dev-server --template nixos-base
   proxmox new staging --template nixos-base
   proxmox new prod --template nixos-base --full
   ```

   Each clone automatically gets its hostname set to the VM name via cloud-init.

5. **Provision with NixOS** (optional): Apply the same flake config to all VMs

   ```bash
   proxmox provision dev-server ~/nixos#proxmox-vm
   proxmox provision staging ~/nixos#proxmox-vm
   proxmox provision prod ~/nixos#proxmox-vm
   ```

   The hostname was already set by cloud-init, so a single flake config works for all VMs.

## Cloud-Init & Hostname

When you create a template with `proxmox images new`, a cloud-init drive is automatically added. When cloning from that template, the VM name is set as the hostname via cloud-init's `cinode` parameter.

For this to work with NixOS, enable cloud-init in your configuration:

```nix
# In your NixOS config (e.g., machines/proxmox-vm/default.nix)
{ lib, ... }:
{
  # Fallback hostname for build time (cloud-init overrides at runtime)
  networking.hostName = lib.mkDefault "nixos";

  # Cloud-init sets the actual hostname at boot from Proxmox VM name
  services.cloud-init = {
    enable = true;
    network.enable = false;  # Handle networking separately
    settings.preserve_hostname = false;
  };

  # mDNS: use system hostname dynamically (required for .local resolution)
  services.avahi = {
    enable = true;
    hostName = "";  # Empty = use system hostname from gethostname()
    nssmdns4 = true;
    publish = {
      enable = true;
      addresses = true;
      workstation = true;
    };
  };
}
```

This allows you to use **one flake configuration for multiple VMs**, each with a different hostname.

## mDNS / Avahi Configuration

For `.local` hostname resolution (mDNS) to work correctly with cloned VMs, avahi must be configured to use the system hostname dynamically rather than a hardcoded value.

**The Problem**: By default, NixOS sets `services.avahi.hostName` to `networking.hostName` at build time. This means all clones of a template will advertise the same mDNS hostname (e.g., `nixos.local`) regardless of what cloud-init sets at runtime.

**The Fix**: Set `services.avahi.hostName = ""` (empty string) to make avahi read the hostname from the system at runtime via `gethostname()`. This is included in the NixOS example above.

With this configuration:
1. Cloud-init sets `/etc/hostname` to the VM name at boot
2. Avahi reads the hostname dynamically via `gethostname()`
3. The VM is reachable at `<vm-name>.local`

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun cli --help          # run from source
bun run build           # bundle to dist/cli.js (runs on Node)
bun run local:install   # build and link the `proxmox` binary globally
bun run lint && bun run typecheck && bun run test
```
