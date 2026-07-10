using System;
using System.Threading.Tasks;
using Unity.Netcode;
using Unity.Netcode.Transports.UTP;
using Unity.Networking.Transport.Relay;
using Unity.Services.Authentication;
using Unity.Services.Core;
using Unity.Services.Relay;
using Unity.Services.Relay.Models;
using UnityEngine;

namespace Barbah.Coop
{
    /// <summary>
    /// Online eslesme: Unity Relay uzerinden oda kurma / oda koduyla katilma.
    /// Iki telefon internet uzerinden ayni odada bulusur; NAT/port sorunu
    /// olmadan calisir. It Takes Two gibi tam 2 oyunculuktur.
    /// </summary>
    public class ConnectionManager : MonoBehaviour
    {
        public const int MaxPlayers = 2;

        public static ConnectionManager Instance { get; private set; }

        /// <summary>Oda kurulduysa paylasilacak kod.</summary>
        public string JoinCode { get; private set; }

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        /// <summary>Unity servislerini baslatir ve anonim giris yapar.</summary>
        public async Task InitializeAsync()
        {
            if (UnityServices.State != ServicesInitializationState.Initialized)
                await UnityServices.InitializeAsync();

            if (!AuthenticationService.Instance.IsSignedIn)
                await AuthenticationService.Instance.SignInAnonymouslyAsync();
        }

        /// <summary>Oda kurar ve paylasilacak oda kodunu dondurur.</summary>
        public async Task<string> StartHostAsync()
        {
            Allocation allocation = await RelayService.Instance.CreateAllocationAsync(MaxPlayers - 1);
            JoinCode = await RelayService.Instance.GetJoinCodeAsync(allocation.AllocationId);

            GetTransport().SetRelayServerData(new RelayServerData(allocation, "dtls"));

            if (!NetworkManager.Singleton.StartHost())
                throw new Exception("Oda baslatilamadi.");

            return JoinCode;
        }

        /// <summary>Oda koduyla mevcut odaya katilir.</summary>
        public async Task JoinAsync(string joinCode)
        {
            JoinAllocation allocation = await RelayService.Instance.JoinAllocationAsync(joinCode);

            GetTransport().SetRelayServerData(new RelayServerData(allocation, "dtls"));

            if (!NetworkManager.Singleton.StartClient())
                throw new Exception("Odaya baglanilamadi.");
        }

        private static UnityTransport GetTransport()
        {
            return (UnityTransport)NetworkManager.Singleton.NetworkConfig.NetworkTransport;
        }
    }
}
