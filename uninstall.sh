#!/bin/bash
gnome-extensions disable math-manifold@kaush 2>/dev/null || true
rm -rf "$HOME/.local/share/gnome-shell/extensions/math-manifold@kaush" "$HOME/.config/manifold"
sudo rm -f /usr/local/bin/manifoldctl
gsettings reset org.gnome.desktop.background picture-uri
gsettings reset org.gnome.desktop.background picture-uri-dark
echo "✅ Protocol Manifold completely removed."
