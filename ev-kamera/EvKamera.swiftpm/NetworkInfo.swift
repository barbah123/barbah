import Darwin
import Foundation

struct ServerAddress: Identifiable, Hashable {
    let label: String
    let url: String
    var id: String { url }
}

enum NetworkInfo {
    /// iPad'in IPv4 adreslerinden tarayıcıda açılacak URL'leri üretir.
    static func addresses(port: UInt16) -> [ServerAddress] {
        var result: [ServerAddress] = []
        var ifaddr: UnsafeMutablePointer<ifaddrs>?
        guard getifaddrs(&ifaddr) == 0, let first = ifaddr else { return [] }
        defer { freeifaddrs(ifaddr) }

        for pointer in sequence(first: first, next: { $0.pointee.ifa_next }) {
            let ifa = pointer.pointee
            guard let addr = ifa.ifa_addr, addr.pointee.sa_family == UInt8(AF_INET) else { continue }
            let flags = Int32(ifa.ifa_flags)
            guard flags & IFF_UP != 0, flags & IFF_LOOPBACK == 0 else { continue }

            var host = [CChar](repeating: 0, count: Int(NI_MAXHOST))
            guard getnameinfo(addr, socklen_t(addr.pointee.sa_len), &host, socklen_t(host.count),
                              nil, 0, NI_NUMERICHOST) == 0 else { continue }
            let ip = String(cString: host)
            let name = String(cString: ifa.ifa_name)
            guard !ip.hasPrefix("169.254.") else { continue }

            let label: String
            if name == "en0" {
                label = "Wi‑Fi (ev ağı)"
            } else if name.hasPrefix("utun"), ip.hasPrefix("100.") {
                label = "Tailscale (dışarıdan erişim)"
            } else if name.hasPrefix("pdp_ip") {
                continue // hücresel – gelen bağlantıya kapalı
            } else {
                label = name
            }
            result.append(ServerAddress(label: label, url: "http://\(ip):\(port)"))
        }
        return result.sorted { $0.label < $1.label }
    }
}
