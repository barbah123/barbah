package com.barbah.evkamera

import java.net.Inet4Address
import java.net.NetworkInterface

data class ServerAddress(val label: String, val url: String)

object NetworkInfo {
    /** Cihazın IPv4 adreslerinden tarayıcıda açılacak URL'leri üretir. */
    fun addresses(port: Int = Settings.PORT): List<ServerAddress> {
        val result = mutableListOf<ServerAddress>()
        val interfaces = runCatching { NetworkInterface.getNetworkInterfaces()?.toList() }.getOrNull().orEmpty()
        for (iface in interfaces) {
            if (!runCatching { iface.isUp && !iface.isLoopback }.getOrDefault(false)) continue
            for (addr in iface.inetAddresses.toList()) {
                if (addr !is Inet4Address || addr.isLinkLocalAddress) continue
                val ip = addr.hostAddress ?: continue
                val name = iface.name
                val label = when {
                    name.startsWith("wlan") -> "Wi‑Fi (ev ağı)"
                    name.startsWith("eth") -> "Kablolu ağ"
                    isTailscale(ip) -> "Tailscale (dışarıdan erişim)"
                    name.startsWith("rmnet") || name.startsWith("ccmni") -> continue // hücresel
                    else -> name
                }
                result += ServerAddress(label, "http://$ip:$port")
            }
        }
        return result.sortedBy { it.label }
    }

    /** Tailscale adresleri 100.64.0.0/10 aralığındadır. */
    private fun isTailscale(ip: String): Boolean {
        val parts = ip.split('.').mapNotNull { it.toIntOrNull() }
        return parts.size == 4 && parts[0] == 100 && parts[1] in 64..127
    }
}
