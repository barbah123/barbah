using Unity.Netcode.Components;

namespace Barbah.Coop
{
    /// <summary>
    /// Sahibi tarafindan yonetilen NetworkTransform: her oyuncu kendi
    /// karakterinin pozisyonunu kendi cihazinda hesaplar, diger cihazlara
    /// iletilir. Kucuk co-op oyunlar icin akici ve basit bir model.
    /// </summary>
    public class ClientNetworkTransform : NetworkTransform
    {
        protected override bool OnIsServerAuthoritative() => false;
    }
}
