import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useWallet } from "../context/WalletContext.js";
import { useToast } from "../context/ToastContext.js";
import { withdrawalOptions } from "../lib/transactionPolicy.js";
function useAsyncMutation(action:"request-withdraw"|"claim-withdraw"|"cancel-withdraw") {
  const {callContract,address}=useWallet(); const {show}=useToast(); const qc=useQueryClient();
  return useMutation({mutationFn:async ({adapter,minPayoutSats}:{adapter:string;minPayoutSats?:bigint})=>{
    if(!address) throw new Error("Wallet not connected");
    return callContract({...await withdrawalOptions(address,adapter,action,minPayoutSats),expectedSender:address});
  },onSuccess:(txid)=>{show({variant:"pending",message:"Transaction submitted. Wait for chain confirmation before assuming the position changed.",txid});void qc.invalidateQueries({queryKey:["position",address]});void qc.invalidateQueries({queryKey:["balance",address]});},
  onError:(err:unknown)=>show({variant:"error",message:err instanceof Error?err.message:"Action failed"})});
}
export const useRequestWithdraw=()=>useAsyncMutation("request-withdraw");
export const useClaimWithdraw=()=>useAsyncMutation("claim-withdraw");
export const useCancelWithdraw=()=>useAsyncMutation("cancel-withdraw");
